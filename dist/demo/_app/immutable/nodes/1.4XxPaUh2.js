import "../chunks/DIQkfzf6.js";
import { i as init } from "../chunks/BActlzJV.js";
import { p as push, k as from_html, l as first_child, t as template_effect, m as append, n as pop, o as child, s as reset, v as sibling, w as set_text } from "../chunks/T3HeJ6fH.js";
import { s as stores, p as page$2 } from "../chunks/DOBfrr44.js";
const page$1 = {
  get error() {
    return page$2.error;
  },
  get status() {
    return page$2.status;
  }
};
({
  check: stores.updated.check
});
const page = page$1;
var root = from_html(`<h1> </h1> <p> </p>`, 1);
function Error$1($$anchor, $$props) {
  push($$props, false);
  init();
  var fragment = root();
  var h1 = first_child(fragment);
  var text = child(h1, true);
  reset(h1);
  var p = sibling(h1, 2);
  var text_1 = child(p, true);
  reset(p);
  template_effect(() => {
    var _a;
    set_text(text, page.status);
    set_text(text_1, (_a = page.error) == null ? void 0 : _a.message);
  });
  append($$anchor, fragment);
  pop();
}
export {
  Error$1 as component
};
//# sourceMappingURL=1.4XxPaUh2.js.map
