import { SaxesParser } from "saxes"; //saxes is the XML parser
import type { SaxesAttributeNS } from "saxes"; //SaxesAttributeNS is a type that describes what attribute looks like
import * as path from "path";
import * as url from "url";
import { window } from "vscode";
import { NodePath, XPathStep } from "./types";


export function normalizeSchemaUrl(schemaURL: string): string {
  try {
    new URL(schemaURL);
    return schemaURL;
  } catch (error) {
    const schemaPath = path.parse(schemaURL);
    const activeEditor = window.activeTextEditor;
    // Determine if local path.
    if (schemaPath.root !== "") {
      return url.pathToFileURL(schemaURL).toString();
    } else {
      // NOT a full URL, treat as relative path
      const basePath = activeEditor?.document.uri.fsPath.split(/[\\/]/).slice(0, -1).join("/");
      return url.pathToFileURL(basePath + "/" + schemaURL).toString();
    }
  }
}

export function truncate(str: string, n: number){
  return (str.length > n) ? str.substring(0, n-1) + "…" : str;
}

export function parseXPath(xpath: string): XPathStep[] {
  const steps: XPathStep[] = [];
  let pos = 0;

  while (pos < xpath.length) {
    if (xpath[pos] !== '/') {
      throw new Error(`Expected '/' at position ${pos}: ${xpath.slice(pos, pos + 20)}`);
    }
    pos++; // skip '/'

    // Check for @
    const isAttribute = xpath[pos] === '@';
    if (isAttribute) pos++;

    if (xpath.slice(pos, pos + 2) !== 'Q{') {
      throw new Error(`Expected 'Q{' at position ${pos}: ${xpath.slice(pos, pos + 20)}`);
    }
    pos += 2;

    const nsEnd = xpath.indexOf('}', pos);
    if (nsEnd === -1) {
      throw new Error(`Unterminated namespace at position ${pos}`);
    }
    const namespace = xpath.slice(pos, nsEnd);
    pos = nsEnd + 1;

    // Read local name
    const nameMatch = xpath.slice(pos).match(/^([^\[/@]+)/);
    if (!nameMatch) {
      throw new Error(`Missing local name at position ${pos}`);
    }
    const local = nameMatch[1];
    pos += local.length;

    // Optional index (for elements)
    let index: number | undefined = undefined;
    if (xpath[pos] === '[') {
      const idxEnd = xpath.indexOf(']', pos);
      if (idxEnd === -1) {
        throw new Error(`Unterminated index at position ${pos}`);
      }
      index = parseInt(xpath.slice(pos + 1, idxEnd), 10);
      pos = idxEnd + 1;
    }

    steps.push({
      name: { namespace, local },
      isAttribute,
      index: isAttribute ? undefined : index ?? 1,
    });
  }

  return steps;
}

export function matchPath(path: NodePath[], steps: XPathStep[]): boolean {
  if (path.length !== steps.length) return false;
  return path.every((p, i) => {
    const s = steps[i];
    return (
      p.ns === s.name.namespace &&
      p.local === s.name.local &&
      (!s.index || p.index === s.index)
    );
  });
}

export function makeStatusMsg(msg: string, icon: string, sch = false, tail?: string) {
  const _tail = tail ? ` ${tail}` : "";
  const fullMsg = `${msg}${_tail}`;
  return sch
    ? `$(gear~spin) ${fullMsg}; checking Schematron.`
    : `$(${icon}) ${fullMsg}.`
}

//this function takes the full document text as a string and returns an arrays with all the 
//IDs that it found. 
export function collectXmlIds(documentText: string): string[] {
  const ids: string[] = []; //initially empty, this will have all xml:id values 
  const parser = new SaxesParser({ xmlns: true, position: false });
  //new XML parser which understands namespaces for xml:id

  parser.on("opentag", (node) => { //every time the parser is on this opening tag then: 
    const names = Object.keys(node.attributes);
    for (const name of names) { //loops through every attribute on that tag
      const attr = node.attributes[name] as SaxesAttributeNS;
      //if statement which checks if this attribute is specifically xml:id
      if (
        attr.local === "id" &&
        attr.uri === "http://www.w3.org/XML/1998/namespace"
      ) {
        if (attr.value && !ids.includes(attr.value)) {
          ids.push(attr.value); //adds it to array 
        }
      }
    }
  });

  try {
    parser.write(documentText).close();
  } catch {
    //Ignore parse errors so document may be incomplete while editing
  }

  return ids; //return collected ids 
}