let createStoreon = modules => {
  let events = {};
  let state = {};
  let store = {
    dispatch(event, data) {
      if (event !== '@dispatch') {
        store.dispatch('@dispatch', [event, data, events[event]]);
      }

      if (events[event]) {
        let changes = {};
        let changed;
        events[event].forEach(i => {
          let diff = i(state, data);

          if (diff && typeof diff.then !== 'function') {
            changed = state = { ...state,
              ...diff
            };
            changes = { ...changes,
              ...diff
            };
          }
        });
        if (changed) store.dispatch('@changed', changes);
      }
    },

    get: () => state,

    on(event, cb) {
      (events[event] || (events[event] = [])).push(cb);
      return () => {
        events[event] = events[event].filter(i => i !== cb);
      };
    }

  };
  modules.forEach(i => {
    if (i) i(store);
  });
  store.dispatch('@init');
  return store;
};

let loc = location;
/**
 * Change event
 */

let change = Symbol();
/**
 * Changed event
 */

let routerChanged = Symbol();
/**
 * Navigate event
 */

let routerNavigate = Symbol();
/**
 * Router routerKey on store
 */

let routerKey = Symbol('route');
/**
 * Storeon module for URL routing
 * @param {Route[]} routes
 */

function createRouter(routes = []) {
  return store => {
    store.on('@init', () => {
      store.dispatch(change, parse(loc.pathname, routes));
    });
    store.on(routerChanged, () => {});
    store.on(routerNavigate, (state, path) => {
      if (state[routerKey].path !== path) {
        history.pushState(null, null, path);
      }

      store.dispatch(change, parse(path, routes));
      store.dispatch(routerChanged, store.get()[routerKey]);
    });
    store.on(change, (state, [path, index, params = []]) => {
      let route = routes[index];
      let newState = {};
      newState[routerKey] = {
        match: false,
        path,
        params
      };

      if (route) {
        newState[routerKey].match = route[1](...params);
      }

      return newState;
    });
    document.documentElement.addEventListener('click', event => {
      if (!event.defaultPrevented && event.target.tagName === 'A' && event.target.href.indexOf(loc.origin) === 0 && event.target.target !== '_blank' && event.target.dataset.ignoreRouter == null && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        store.dispatch(routerNavigate, event.target.href.slice(loc.origin.length));
      }
    });
    window.addEventListener('popstate', () => {
      if (store.get()[routerKey].path !== loc.pathname) {
        store.dispatch(change, parse(loc.pathname, routes));
        store.dispatch(routerChanged, store.get()[routerKey]);
      }
    });
  };
}
/**
 * @private
 * @param {string} path
 * @param {Route[]} routes
 * @return {[string, number, string[]]}
 */


function parse(path, routes) {
  let normalized = path.replace(/(^\/|\/$)/g, '');

  for (let [index, [itemPath]] of routes.entries()) {
    if (typeof itemPath === 'string') {
      let checkPath = itemPath.replace(/(^\/|\/$)/g, '');

      if (checkPath === normalized) {
        return [path, index];
      }

      if (checkPath.includes('*')) {
        let prepareRe = checkPath.replace(/[\s!#$()+,.:<=?[\\\]^{|}]/g, '\\$&').replace(/\*/g, '([^/]*)');
        let re = RegExp('^' + prepareRe + '$', 'i');
        let match = normalized.match(re);

        if (match) {
          return [path, index, match.slice(1)];
        }
      }
    }

    if (itemPath instanceof RegExp) {
      let matchRE = normalized.match(itemPath);

      if (matchRE) {
        return [path, index, matchRE.slice(1)];
      }
    }
  }

  return [path];
}

function getChildrenDeep(children) {
  return children.reduce((res, curr) => res.concat(curr, getChildrenDeep(curr._children)), []);
}

const EMPTY_ARR = [];
let tracking;
/**
 * Creates a root and executes the passed function that can contain computations.
 * The executed function receives an `unsubscribe` argument which can be called to
 * unsubscribe all inner computations.
 *
 * @param  {Function} fn
 * @return {*}
 */

function root(fn) {
  const prevTracking = tracking;

  const rootUpdate = () => {};

  tracking = rootUpdate;
  resetUpdate(rootUpdate);
  const result = fn(() => {
    _unsubscribe(rootUpdate);

    tracking = undefined;
  });
  tracking = prevTracking;
  return result;
}
/**
 * Sample the current value of an observable but don't create a dependency on it.
 *
 * @example
 * computed(() => { if (foo()) bar(sample(bar) + 1); });
 *
 * @param  {Function} fn
 * @return {*}
 */

function sample(fn) {
  const prevTracking = tracking;
  tracking = undefined;
  const value = fn();
  tracking = prevTracking;
  return value;
}
/**
 * Creates a new observable, returns a function which can be used to get
 * the observable's value by calling the function without any arguments
 * and set the value by passing one argument of any type.
 *
 * @param  {*} value - Initial value.
 * @return {Function}
 */

function observable(value) {
  function data(nextValue) {
    if (arguments.length === 0) {
      if (tracking && !data._observers.has(tracking)) {
        data._observers.add(tracking);

        tracking._observables.push(data);
      }

      return value;
    }

    value = nextValue; // Clear `tracking` otherwise a computed triggered by a set
    // in another computed is seen as a child of that other computed.

    const clearedUpdate = tracking;
    tracking = undefined; // Update can alter data._observers, make a copy before running.

    data._runObservers = new Set(data._observers);

    data._runObservers.forEach(observer => observer._fresh = false);

    data._runObservers.forEach(observer => {
      if (!observer._fresh) observer();
    });

    tracking = clearedUpdate;
    return value;
  } // Tiny indicator that this is an observable function.


  data.$o = true;
  data._observers = new Set(); // The 'not set' value must be unique, so `nullish` can be set in a transaction.

  data._pending = EMPTY_ARR;
  return data;
}
/**
 * Creates a new computation which runs when defined and automatically re-runs
 * when any of the used observable's values are set.
 *
 * @param {Function} observer
 * @param {*} value - Seed value.
 * @return {Function} Computation which can be used in other computations.
 */

function computed(observer, value) {
  observer._update = update; // if (tracking == null) {
  //   console.warn("computations created without a root or parent will never be disposed");
  // }

  resetUpdate(update);
  update();

  function update() {
    const prevTracking = tracking;

    if (tracking) {
      tracking._children.push(update);
    }

    const prevChildren = update._children;

    _unsubscribe(update);

    update._fresh = true;
    tracking = update;
    value = observer(value); // If any children computations were removed mark them as fresh.
    // Check the diff of the children list between pre and post update.

    prevChildren.forEach(u => {
      if (update._children.indexOf(u) === -1) {
        u._fresh = true;
      }
    }); // If any children were marked as fresh remove them from the run lists.

    const allChildren = getChildrenDeep(update._children);
    allChildren.forEach(removeFreshChildren);
    tracking = prevTracking;
    return value;
  } // Tiny indicator that this is an observable function.


  data.$o = true;

  function data() {
    if (update._fresh) {
      update._observables.forEach(o => o());
    } else {
      value = update();
    }

    return value;
  }

  return data;
}

function removeFreshChildren(u) {
  if (u._fresh) {
    u._observables.forEach(o => {
      if (o._runObservers) {
        o._runObservers.delete(u);
      }
    });
  }
}
/**
 * Run the given function just before the enclosing computation updates
 * or is disposed.
 * @param  {Function} fn
 * @return {Function}
 */

function cleanup(fn) {
  if (tracking) {
    tracking._cleanups.push(fn);
  }

  return fn;
}
/**
 * Subscribe to updates of an observable.
 * @param  {Function} observer
 * @return {Function}
 */

function subscribe(observer) {
  computed(observer);
  return () => _unsubscribe(observer._update);
}

function _unsubscribe(update) {
  update._children.forEach(_unsubscribe);

  update._observables.forEach(o => {
    o._observers.delete(update);

    if (o._runObservers) {
      o._runObservers.delete(update);
    }
  });

  update._cleanups.forEach(c => c());

  resetUpdate(update);
}

function resetUpdate(update) {
  // Keep track of which observables trigger updates. Needed for unsubscribe.
  update._observables = [];
  update._children = [];
  update._cleanups = [];
}

/*
 * @param {object} api
 * @param {Function} [api.subscribe] - Function that listens to state changes.
 * @param {Function} [api.cleanup] - Add the given function to the cleanup stack.
 */
const api = {};

const EMPTY_ARR$1 = [];

function castNode(value) {
  if (typeof value === 'string') {
    return document.createTextNode(value);
  }

  if (!(value instanceof Node)) {
    // Passing an empty array creates a DocumentFragment.
    return api.h(EMPTY_ARR$1, value);
  }

  return value;
}

function frag(value) {
  const {
    childNodes
  } = value;
  if (!childNodes || value.nodeType !== 11) return;

  if (childNodes.length < 2) {
    return childNodes[0];
  } // For a fragment of 2 elements or more add a startMark. This is required
  // for multiple nested conditional computeds that return fragments.


  const _startMark = add(value, '', childNodes[0]);

  return {
    _startMark
  };
}

/**
 * Add a string or node before a reference node or at the end.
 *
 * @param {Node} parent
 * @param {Node|string} value
 * @param {Node} [endMark]
 * @return {Node}
 */

function add(parent, value, endMark) {
  value = castNode(value);
  const fragOrNode = frag(value) || value; // If endMark is `null`, value will be added to the end of the list.

  parent.insertBefore(value, endMark && endMark.parentNode && endMark);
  return fragOrNode;
}

/**
 * Removes nodes, starting from `startNode` (inclusive) to `endMark` (exclusive).
 *
 * @param  {Node} parent
 * @param  {Node} startNode - This is the start node.
 * @param  {Node} endMark - This is the ending marker node.
 */
function removeNodes(parent, startNode, endMark) {
  while (startNode && startNode !== endMark) {
    const n = startNode.nextSibling; // Is needed in case the child was pulled out the parent before clearing.

    if (parent === startNode.parentNode) {
      parent.removeChild(startNode);
    }

    startNode = n;
  }
}

function insert(el, value, endMark, current, startNode) {
  // This is needed if the el is a DocumentFragment initially.
  el = endMark && endMark.parentNode || el; // Save startNode of current. In clear() endMark.previousSibling
  // is not always accurate if content gets pulled before clearing.

  startNode = startNode || current instanceof Node && current;
  if (value === current) ;else if ((!current || typeof current === 'string') && (typeof value === 'string' || typeof value === 'number' && (value += ''))) {
    // Block optimized for string insertion.
    if (current == null || !el.firstChild) {
      if (endMark) {
        add(el, value, endMark);
      } else {
        // textContent is a lot faster than append -> createTextNode.
        el.textContent = value;
      }
    } else {
      if (endMark) {
        (endMark.previousSibling || el.lastChild).data = value;
      } else {
        el.firstChild.data = value;
      }
    }

    current = value;
  } else if (typeof value === 'function') {
    api.subscribe(function insertContent() {
      current = api.insert(el, value.call({
        el,
        endMark
      }), endMark, current, startNode);
    });
  } else {
    // Block for nodes, fragments, Arrays, non-stringables and node -> stringable.
    if (endMark) {
      // `current` can't be `0`, it's coerced to a string in insert.
      if (current) {
        if (!startNode) {
          // Support fragments
          startNode = current._startMark && current._startMark.nextSibling || endMark.previousSibling;
        }

        removeNodes(el, startNode, endMark);
      }
    } else {
      el.textContent = '';
    }

    current = null;

    if (value && value !== true) {
      current = add(el, value, endMark);
    }
  }
  return current;
}

function property(el, value, name, isAttr, isCss) {
  if (value == null) return;

  if (!name || name === 'attrs' && (isAttr = true)) {
    for (name in value) {
      api.property(el, value[name], name, isAttr, isCss);
    }
  } else if (name[0] === 'o' && name[1] === 'n' && !value.$o) {
    // Functions added as event handlers are not executed
    // on render unless they have an observable indicator.
    handleEvent(el, name, value);
  } else if (typeof value === 'function') {
    api.subscribe(function setProperty() {
      api.property(el, value.call({
        el,
        name
      }), name, isAttr, isCss);
    });
  } else if (isCss) {
    el.style.setProperty(name, value);
  } else if (isAttr || name.slice(0, 5) === 'data-' || name.slice(0, 5) === 'aria-') {
    el.setAttribute(name, value);
  } else if (name === 'style') {
    if (typeof value === 'string') {
      el.style.cssText = value;
    } else {
      api.property(el, value, null, isAttr, true);
    }
  } else {
    if (name === 'class') name += 'Name';
    el[name] = value;
  }
}

function handleEvent(el, name, value) {
  name = name.slice(2).toLowerCase();

  if (value) {
    el.addEventListener(name, eventProxy);
  } else {
    el.removeEventListener(name, eventProxy);
  }

  (el._listeners || (el._listeners = {}))[name] = value;
}
/**
 * Proxy an event to hooked event handlers.
 * @param {Event} e - The event object from the browser.
 * @return {Function}
 */


function eventProxy(e) {
  // eslint-disable-next-line
  return this._listeners[e.type](e);
}

/* Adapted from Hyper DOM Expressions - The MIT License - Ryan Carniato */
/**
 * Create a sinuous `h` tag aka hyperscript.
 * @param {object} options
 * @param  {boolean} isSvg
 * @return {Function} `h` tag.
 */

function context(options, isSvg) {
  for (let i in options) api[i] = options[i];

  function h() {
    const args = Array.from(arguments);
    let el;

    function item(arg) {
      if (arg == null) ;else if (typeof arg === 'string') {
        if (el) {
          add(el, arg);
        } else {
          if (isSvg) {
            el = document.createElementNS('http://www.w3.org/2000/svg', arg);
          } else {
            el = document.createElement(arg);
          }
        }
      } else if (Array.isArray(arg)) {
        // Support Fragments
        if (!el) el = document.createDocumentFragment();
        arg.forEach(item);
      } else if (arg instanceof Node) {
        if (el) {
          add(el, arg);
        } else {
          // Support updates
          el = arg;
        }
      } else if (typeof arg === 'object') {
        api.property(el, arg, null, isSvg);
      } else if (typeof arg === 'function') {
        if (el) {
          const endMark = add(el, '');
          api.insert(el, arg, endMark);
        } else {
          // Support Components
          el = arg.apply(null, args.splice(1));
        }
      } else {
        add(el, '' + arg);
      }
    }

    args.forEach(item);
    return el;
  }

  return h;
}

/* Adapted from DOM Expressions - The MIT License - Ryan Carniato */
api.insert = insert;
api.property = property;
api.add = add;
api.rm = removeNodes;

function diff(parent, a, b, get, before) {
  const aIdx = new Map();
  const bIdx = new Map();
  let i;
  let j; // Create a mapping from keys to their position in the old list

  for (i = 0; i < a.length; i++) {
    aIdx.set(a[i], i);
  } // Create a mapping from keys to their position in the new list


  for (i = 0; i < b.length; i++) {
    bIdx.set(b[i], i);
  }

  for (i = j = 0; i !== a.length || j !== b.length;) {
    var aElm = a[i],
        bElm = b[j];

    if (aElm === null) {
      // This is a element that has been moved to earlier in the list
      i++;
    } else if (b.length <= j) {
      // No more elements in new, this is a delete
      parent.removeChild(get(a[i], -1));
      i++;
    } else if (a.length <= i) {
      // No more elements in old, this is an addition
      parent.insertBefore(get(bElm, 1), get(a[i], 0) || before);
      j++;
    } else if (aElm === bElm) {
      // No difference, we move on
      i++;
      j++;
    } else {
      // Look for the current element at this location in the new list
      // This gives us the idx of where this element should be
      var curElmInNew = bIdx.get(aElm); // Look for the the wanted elment at this location in the old list
      // This gives us the idx of where the wanted element is now

      var wantedElmInOld = aIdx.get(bElm);

      if (curElmInNew === undefined) {
        // Current element is not in new list, it has been removed
        parent.removeChild(get(a[i], -1));
        i++;
      } else if (wantedElmInOld === undefined) {
        // New element is not in old list, it has been added
        parent.insertBefore(get(bElm, 1), get(a[i], 0) || before);
        j++;
      } else {
        // Element is in both lists, it has been moved
        parent.insertBefore(get(a[wantedElmInOld], 1), get(a[i], 0) || before);
        a[wantedElmInOld] = null;
        if (wantedElmInOld > i + 1) i++;
        j++;
      }
    }
  }

  return b;
}

/**
 * Map over a list of unique items that create DOM nodes.
 *
 * No duplicates in the list of items is a hard requirement, the diffing
 * algorithm will not work with duplicate values. See `./unique.js`.
 *
 * @param  {Function} items - Function or observable that creates a list.
 * @param  {Function} expr
 * @param {boolean} [cleaning]
 * @return {DocumentFragment}
 */

function map(items, expr, cleaning) {
  const {
    root,
    subscribe,
    sample,
    cleanup
  } = api; // Disable cleaning for templates by default.

  if (cleaning == null) cleaning = !expr.$t;
  const parent = api.h([]);
  const endMark = api.add(parent, '');
  const disposers = new Map();
  const nodes = new Map();
  const toRemove = new Set();
  const unsubscribe = subscribe(a => {
    const b = items();
    return sample(() => {
      toRemove.clear(); // Array.from to make a copy of the current list.

      const content = Array.from(diff(endMark.parentNode, a || [], b, node, endMark));
      toRemove.forEach(dispose);
      return content;
    });
  });
  cleanup(unsubscribe);
  cleanup(disposeAll);

  function node(item, i) {
    if (item == null) return;
    let n = nodes.get(item);

    if (i === 1) {
      toRemove.delete(item);

      if (!n) {
        n = cleaning ? root(dispose => {
          disposers.set(item, dispose);
          return expr(item.$v || item);
        }) : expr(item.$v || item);
        if (n.nodeType === 11) n = n.firstChild;
        nodes.set(item, n);
      }
    } else if (i === -1) {
      toRemove.add(item);
    }

    return n;
  }

  function disposeAll() {
    disposers.forEach(d => d());
    disposers.clear();
    nodes.clear();
    toRemove.clear();
  }

  function dispose(item) {
    let disposer = disposers.get(item);

    if (disposer) {
      disposer();
      disposers.delete(item);
    }

    nodes.delete(item);
  }

  return parent;
}

/*
 * Sinuous by Wesley Luyten (@luwes).
 * Really ties all the packages together.
 */
api.h = context({
  subscribe,
  cleanup,
  root,
  sample
});
api.hs = context({
  subscribe,
  cleanup,
  root,
  sample
}, true); // Makes it possible to intercept `h` calls and customize.

/*
 * Sinuous by Wesley Luyten (@luwes).
 * Really ties all the packages together.
 */
api.h = context({
  subscribe,
  cleanup,
  root,
  sample
});
api.hs = context({
  subscribe,
  cleanup,
  root,
  sample
}, true); // Makes it possible to intercept `h` calls and customize.

function h() {
  return api.h.apply(api.h, arguments);
} // Makes it possible to intercept `hs` calls and customize.

const HelloMessage = ({
  name
}) => h("h1", {
  "class": "title text-4"
}, "Hello ", name);

const Home = () => h(HelloMessage, {
  name: "World"
});

const Post = props => h([h("h1", {
  "class": "title text-4"
}, "Post"), h("p", null, JSON.stringify(props))]);

const TodoApp = () => {
  const text = observable('');
  const items = observable([]);
  const stored = localStorage.getItem('app.todo');
  if (stored) items(JSON.parse(stored));
  const view = h([h("style", null, ".control {\n        margin-bottom: var(--space-xs);\n      }"), h("div", null, h("h1", {
    "class": "title text-4"
  }, "Todo List"), h(TodoList, {
    items: items
  }), h("form", {
    onsubmit: handleSubmit
  }, h("label", {
    "class": "label",
    htmlFor: "new-todo"
  }, "What needs to be done?"), h("input", {
    id: "new-todo",
    "class": "control",
    onchange: e => text(e.target.value),
    value: text
  }), h("button", {
    "class": "button is-primary is-outlined"
  }, "Add #", () => items().length + 1)))]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!text().length) return;
    items([...items(), {
      text: text(),
      id: Date.now()
    }]);
    localStorage.setItem('app.todo', JSON.stringify(items()));
    text('');
  }

  return view;
};

const TodoList = ({
  items
}) => h("ul", null, map(items, item => h("li", {
  id: item.id
}, item.text)));

const NotFound = () => h("h1", {
  "class": "title text-4"
}, "Not Found");

var App = (v => h([h(Header, null), h("main", null, h("div", {
  "class": "box",
  "data-theme": "light"
}, v))]));

const Header = () => h("header", null, h("div", {
  "class": "box",
  "data-theme": "light"
}, h("p", {
  "class": "title text-4"
}, "Plain SPA"), h("nav", null, h("ul", {
  "class": "stack-h"
}, h("li", null, h("a", {
  href: "/"
}, "Home!!")), h("li", null, h("a", {
  href: "/todo"
}, "Todo")), h("li", null, h("a", {
  href: "/blog/post-with-id"
}, "Post with ID")), h("li", null, h("a", {
  href: "/any-link",
  "data-ignore-router": true
}, "Ignore Router Link")), h("li", null, h("a", {
  href: "/not-found"
}, "404"))))));

const routes = [['/', () => ({
  page: 'home',
  component: Home
})], ['/todo', () => ({
  page: 'todo',
  component: TodoApp
})], ['/blog/*', id => ({
  page: 'post',
  component: Post({
    id
  }),
  id
})], ['*', () => ({
  page: 'error',
  component: NotFound
})]]; // Create a storeon instance and fill it with routes

const store = createStoreon([createRouter(routes)]); // Get the current route

const route = store.get()[routerKey];
console.log(route); // Render view of current route

const view = observable(route.match.component); // Update view when route has changed

store.on(routerChanged, (_, data) => {
  console.log(data);
  view(data.match.component);
}); // Render app

document.getElementById('app').append(App(view));
