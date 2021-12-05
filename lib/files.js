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

const writeFile = async function (_filename, _format, _options = {}) {
  let filename = _filename;
  let content = undefined;
  switch (_format) {
    case "markdown":
      filename = filename.replace(".md", ".html");
      content = _options.file
        ? fs.readFileSync(_options.file, "utf8")
        : _options.data || "";
      content = await minify(
        decorateHTML(
          `<section class="container">${parse(content)}</section>`,
          _options
        )
      );
      fs.writeFileSync(filename, content);
      break;
    case "scss":
      filename = filename.replace(".scss", ".css");
      content = sass
        .renderSync({
          file: _options.file,
          data: _options.data,
          outputStyle: "compressed",
        })
        .css.toString();
      fs.writeFileSync(filename, content);
      break;
    default:
      fs.copyFileSync(_options.file, filename);
  }
  console.log(`File ${filename} written successfully.`);
};

export { determineFormat, writeFile };
