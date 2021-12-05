import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import YAML from "yaml";

import { getGist } from "./lib/gist.js";
import { determineFormat, writeFile } from "./lib/files.js";
import { generateIndex } from "./lib/html.js";

const DIST_DIR = "dist";

const index = [];
const styleSheets = [];

const config = YAML.parse(await fsPromises.readFile("deploy.yml", "utf8"));

if (!fs.existsSync(DIST_DIR)) {
  await fsPromises.mkdir(DIST_DIR, { recursive: true });
}

let theme = config.theme;

if (!theme || !fs.existsSync(`./lib/themes/${theme}.scss`)) {
  theme = "default";
}

const styleFilename = path.basename(
  await writeFile(path.join(DIST_DIR, "style.css"), "scss", {
    file: `./lib/themes/${theme}.scss`,
    fingerprint: true,
  })
);

let avatarFilename = undefined;
if (config.avatar) {
  const avatarFormat = determineFormat(config.avatar);
  avatarFilename = path.basename(
    await writeFile(
      path.join(DIST_DIR, `avatar.${avatarFormat}`),
      avatarFormat,
      {
        file: config.avatar,
        fingerprint: true,
      }
    )
  );
}

for (let copy of config.index.copy) {
  let format = determineFormat(copy.input);
  let outputFilename = copy.output || path.basename(copy.input);
  if (format === "scss" || format === "css") {
    styleSheets.push(outputFilename.replace(".scss", ".css"));
  }
  await writeFile(path.join(DIST_DIR, outputFilename), format, {
    file: copy.input,
  });
}

for (let linkConfig of config.links || []) {
  if (linkConfig.outputDir) {
    let outputDir = path.join(DIST_DIR, linkConfig.outputDir);
    if (!fs.existsSync(outputDir)) {
      await fsPromises.mkdir(outputDir, { recursive: true });
    }

    for (let copy of linkConfig.copy || []) {
      await writeFile(
        path.join(outputDir, copy.output || path.basename(copy.input)),
        determineFormat(copy.input),
        { file: copy.input }
      );
    }

    if (linkConfig.gistID) {
      let parsed = await getGist(linkConfig.gistID);
      let options = {
        mainTitle: config.title,
        title: parsed.description,
        favicon:
          parsed.files["favicon.ico"] !== undefined ||
          linkConfig.copy?.find(
            (f) =>
              path.basename(f.input) === "favicon.ico" ||
              f.output === "favicon.ico"
          ),
        mainStyleSheet: styleFilename,
      };
      let files = Object.values(parsed.files);
      for (let file of files) {
        await writeFile(
          path.join(outputDir, file.filename),
          determineFormat(file.filename),
          {
            data: file["content"],
            ...options,
          }
        );
      }
      index.push({
        title: parsed.description,
        url: linkConfig.outputDir,
      });
    }
  }

  if (linkConfig.url && linkConfig.title) {
    index.push({ title: linkConfig.title, url: linkConfig.url });
  }
}

const indexContent = await generateIndex(index, {
  mainTitle: config.title,
  avatar: avatarFilename,
  gravatar: config.gravatar,
  favicon: config.index.copy?.find(
    (f) =>
      path.basename(f.input) === "favicon.ico" || f.output === "favicon.ico"
  ),
  mainStyleSheet: styleFilename,
  styleSheets,
});

await fsPromises.writeFile(path.join(DIST_DIR, "index.html"), indexContent);
