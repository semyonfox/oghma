// compatibility shim for react 18+ to support old ReactDOM.render API
// required by @notea/rich-markdown-editor which was built for React 16/17
// NOTE: This file may be obsolete after migration to Lexical editor
// TODO: Remove this file once @notea/rich-markdown-editor is fully removed

'use client';

import ReactDOM from 'react-dom';
import { ReactElement } from 'react';

// only run on client side
if (typeof window !== 'undefined') {
  // store root instances for cleanup
  const rootMap = new WeakMap<Element, any>();

  // polyfill the old ReactDOM.render API using createRoot
  if (typeof (ReactDOM as any).render !== 'function') {
    (ReactDOM as any).render = function(
      element: ReactElement,
      container: Element,
      callback?: () => void
    ) {
      // get or create root for this container
      let root = rootMap.get(container);
      
      if (!root) {
        // @ts-ignore - createRoot exists in React 18+
        root = ReactDOM.createRoot(container);
        rootMap.set(container, root);
      }
      
      // render the element
      root.render(element);
      
      // call callback after render if provided
      if (callback) {
        // use setTimeout to approximate the old behavior
        setTimeout(callback, 0);
      }
      
      return root;
    };
  }

  // polyfill unmountComponentAtNode
  if (typeof (ReactDOM as any).unmountComponentAtNode !== 'function') {
    (ReactDOM as any).unmountComponentAtNode = function(container: Element) {
      const root = rootMap.get(container);
      
      if (root) {
        root.unmount();
        rootMap.delete(container);
        return true;
      }
      
      return false;
    };
  }
}

export default ReactDOM;
