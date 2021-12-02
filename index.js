const fs = require("fs");
const path = require("path");
const https = require("https");
const YAML = require("yaml");
const marked = require("marked");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");
const { minify } = require("html-minifier-terser");

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
  fs.readFileSync(path.join(__dirname, "deploy.yml"), "utf8")
);

const decorateHTML = function (content, options) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${options.title ? `<title>${options.title}</title>` : ""}
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,300italic,700,700italic">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/milligram/1.4.1/milligram.min.css">
  ${
    options.favicon
      ? '<link rel="icon" type="image/x-icon" href="favicon.ico">'
      : ""
  }
</head>
<body><main class="wrapper"><section class="container">${content}</section></main></body>
</html>`;
};

const writeFile = async function (_filename, file, options) {
  let filename = _filename;
  let content = undefined;
  switch (filename.split(".")[1]) {
    case "md":
      filename = filename.replace(".md", ".html");
      content = await minify(
        decorateHTML(
          DOMPurify.sanitize(marked.parse(file["content"])),
          options
        ),
        {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
        }
      );
      break;
    default:
      content = file["content"];
  }
  fs.writeFileSync(filename, content);
  console.log(`Gist ${_filename} is written to ${filename} successfully.`);
};

for (let deploy of data.deploy) {
  let outputDir = path.join(DIST_DIR, deploy.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let copy of deploy.copy) {
    let filename = path.join(outputDir, copy.output);
    fs.copyFileSync(copy.input, filename);
    console.log(`File ${copy.input} is written to ${filename} successfully.`);
  }

  if (deploy.gistID) {
    https
      .get(`https://api.github.com/gists/${deploy.gistID}`, options, (resp) => {
        if (resp.statusCode !== 200) {
          console.log(`Got an error: ${resp.statusCode}`);
          process.exit(1);
        }

        let data = "";
        resp.on("data", (chunk) => {
          data += chunk;
        });

        resp.on("end", async () => {
          console.log(`Gotten gist ${deploy.gistID} successfully from GitHub.`);
          let parsed = JSON.parse(data);
          let options = {
            title: parsed.description,
            favicon:
              parsed.files["favicon.ico"] !== undefined ||
              deploy.copy.find((f) => f.output === "favicon.ico"),
          };
          if (!parsed.files) {
            console.log("Error: not a successful response.");
            process.exit(1);
            return;
          }
          let files = Object.values(parsed.files);
          for (let file of files) {
            await writeFile(path.join(outputDir, file.filename), file, options);
          }
        });
      })
      .on("error", (err) => {
        console.log(`Error getting gist: ${err.message}`);
      });
  }
}
