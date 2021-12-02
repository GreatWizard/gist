const fs = require("fs");
const path = require("path");
const https = require("https");
const YAML = require("yaml");
const marked = require("marked");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");
const { minify } = require('html-minifier-terser');

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const DIST_DIR = "dist";

const options = {
  headers: {
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "actions/get-gist-action",
  },
};

const data = YAML.parse(
  fs.readFileSync(path.join(__dirname, "gist.yml"), "utf8")
);

const decorateHTML = function (content, gist) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${gist.description}</title>
</head>
<body>${content}</body>
</html>`;
};

const writeFile = async function (filename, file, gist) {
  let content = undefined;
  switch (filename.split(".")[1]) {
    case "md":
      filename = filename.replace(".md", ".html");
      content = await minify(decorateHTML(
        DOMPurify.sanitize(marked.parse(file["content"])),
        gist
      ), {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
      });
      break;
    default:
      content = file["content"];
  }
  fs.writeFile(filename, content, function (err) {
    if (err) throw err;
    console.log(`Gist ${gist.description} is written to ${filename} successfully.`);
  });
};

for (let gist of data.gists) {
  https
    .get(`https://api.github.com/gists/${gist.id}`, options, (resp) => {
      if (resp.statusCode !== 200) {
        console.log(`Got an error: ${resp.statusCode}`);
        process.exit(1);
      }

      let data = "";
      resp.on("data", (chunk) => {
        data += chunk;
      });

      resp.on("end", async () => {
        console.log("Gotten gist successfully from GitHub.");
        let parsed = JSON.parse(data);
        if (!parsed.files) {
          console.log("Error: not a successful response.");
          process.exit(1);
          return;
        }
        let files = Object.values(parsed.files);
        let outputDir = path.join(DIST_DIR, gist.outputDir);
        fs.mkdirSync(outputDir, { recursive: true });
        for (let file of files) {
          let filename = path.join(outputDir, file["filename"]);
          await writeFile(filename, file, parsed);
        }
      });
    })
    .on("error", (err) => {
      console.log(`Error getting gist: ${err.message}`);
    });
}
