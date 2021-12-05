import fs from "fs";
import { parse } from "marked";
import sass from "sass";
import md5File from "md5-file";

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
      break;
  }
  if (_options.fingerprint) {
    const hash = await md5File(_options.file);
    const ext = filename.split(".").pop();
    filename = filename.replace(`.${ext}`, `.${hash}.${ext}`);
  }
  if (content) {
    fs.writeFileSync(filename, content);
  } else {
    fs.copyFileSync(_options.file, filename);
  }
  console.log(`File ${filename} written successfully.`);
  return filename;
};

export { determineFormat, writeFile };
