import fs from "fs";
import { parse } from "marked";
import sass from "sass";

import { decorateHTML } from "./html.js";
import minify from "./minify.js";

const determineFormat = function (_filename) {
  const ext = _filename.split(".").pop();
  switch (ext) {
    case "md":
      return "markdown";
    case "scss":
      return "scss";
    default:
      return ext;
  }
};

const writeFile = async function (_filename, _content, _format, _options = {}) {
  let filename = _filename;
  let content = undefined;
  switch (_format) {
    case "markdown":
      filename = filename.replace(".md", ".html");
      content = await minify(
        decorateHTML(
          `<section class="container">${parse(_content)}</section>`,
          _options
        )
      );
      break;
    case "scss":
      filename = filename.replace(".scss", ".css");
      content = sass
        .renderSync({
          data: _content,
          outputStyle: "compressed",
        })
        .css.toString();
      break;
    default:
      content = _content;
  }
  fs.writeFileSync(filename, content);
  console.log(`File ${filename} written successfully.`);
};

export { determineFormat, writeFile };