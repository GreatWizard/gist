import fs from "fs";
import path from "path";
import https from "https";
import YAML from "yaml";
import { parse } from "marked";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { minify } from "html-minifier-terser";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const DIST_DIR = "dist";
const MAIN_TITLE = "GreatWizard";

const options = {
  headers: {
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "actions/get-gist-action",
  },
};

const promises = [];

const data = YAML.parse(fs.readFileSync("deploy.yml", "utf8"));

const decorateHTML = function (content, options) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${
    options.title ? `${options.title} | ${MAIN_TITLE}` : MAIN_TITLE
  }</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,300italic,700,700italic">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/milligram/1.4.1/milligram.min.css">
  ${
    options.favicon
      ? '<link rel="icon" type="image/x-icon" href="favicon.ico">'
      : ""
  }
</head>
<body><main class="wrapper"><section class="container">${DOMPurify.sanitize(
    content
  )}</section></main></body>
</html>`;
};

const generateIndex = function (index) {
  return decorateHTML(
    [
      `<div style="text-align:center;">`,
      `<h1 class="title">${MAIN_TITLE}</h1>`,
      ...index.map(
        (i) => `<p><a class="button" href="${i.url}">${i.title}</a></p>`
      ),
      `</div>`,
    ].join(""),
    {
      title: `Home | ${MAIN_TITLE}`,
      favicon: data?.deploy
        ?.find((f) => f.outputDir === "/")
        ?.copy?.find((f) => f.output === "favicon.ico"),
    }
  );
};

const writeFile = async function (_filename, file, options) {
  let filename = _filename;
  let content = undefined;
  switch (filename.split(".")[1]) {
    case "md":
      filename = filename.replace(".md", ".html");
      content = await minify(decorateHTML(parse(file["content"]), options), {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
      });
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
    promises.push(
      new Promise((resolve, reject) =>
        https
          .get(
            `https://api.github.com/gists/${deploy.gistID}`,
            options,
            (resp) => {
              if (resp.statusCode !== 200) {
                reject(`Got an error: ${resp.statusCode}`);
              }

              let data = "";
              resp.on("data", (chunk) => {
                data += chunk;
              });

              resp.on("end", async () => {
                console.log(
                  `Gotten gist ${deploy.gistID} successfully from GitHub.`
                );
                let parsed = JSON.parse(data);
                let options = {
                  title: parsed.description,
                  favicon:
                    parsed.files["favicon.ico"] !== undefined ||
                    deploy.copy?.find((f) => f.output === "favicon.ico"),
                };
                let files = Object.values(parsed.files);
                for (let file of files) {
                  await writeFile(
                    path.join(outputDir, file.filename),
                    file,
                    options
                  );
                }
                resolve({
                  title: parsed.description,
                  url: deploy.outputDir,
                });
              });
            }
          )
          .on("error", (err) => {
            reject(`Error getting gist: ${err.message}`);
          })
      )
    );
  }
}

const index = await Promise.all(promises);

fs.writeFileSync(path.join(DIST_DIR, "index.html"), generateIndex(index));
