import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import YAML from "yaml";
import commandLineArgs from "command-line-args";
import commandLineUsage from "command-line-usage";

import { getGist } from "./lib/gist.js";
import { determineFormat, writeFile } from "./lib/files.js";
import { generateIndex } from "./lib/html.js";
import { configSchema } from "./lib/schema.js";

const optionList = [
  {
    name: "config",
    alias: "c",
    type: String,
    defaultOption: true,
    defaultValue: "deploy.yml",
    description: "Path to the config file",
  },
  {
    name: "output-dir",
    alias: "o",
    type: String,
    defaultValue: "dist",
    description: "Output directory",
  },
  {
    name: "help",
    alias: "h",
    type: Boolean,
    description: "Print this usage guide",
  },
];

const options = commandLineArgs(optionList);

if (options.help) {
  console.log(
    commandLineUsage([
      {
        header: "Options",
        optionList,
      },
    ])
  );
  process.exit(0);
}

const index = [];
const styleSheets = [];

const config = YAML.parse(await fsPromises.readFile(options.config, "utf8"));
let { error } = configSchema.validate(config, { abortEarly: false });
if (error) {
  throw new Error(
    `Configuration file is invalid:${error.details.map(
      (detail) => `\n  - ${detail.message}`
    )}`
  );
}

if (!fs.existsSync(options["output-dir"])) {
  await fsPromises.mkdir(options["output-dir"], { recursive: true });
}

let theme = config?.theme;

if (!theme || !fs.existsSync(`./lib/themes/${theme}.scss`)) {
  theme = "default";
}

const styleFilename = path.basename(
  await writeFile(path.join(options["output-dir"], "style.css"), "scss", {
    file: `./lib/themes/${theme}.scss`,
    fingerprint: true,
  })
);

let avatarFilename = undefined;
if (config?.avatar) {
  const avatarFormat = determineFormat(config.avatar);
  avatarFilename = path.basename(
    await writeFile(
      path.join(options["output-dir"], `avatar.${avatarFormat}`),
      avatarFormat,
      {
        file: config.avatar,
        fingerprint: true,
      }
    )
  );
}

if (config?.index?.copy) {
  for (let copy of config.index.copy || []) {
    let format = determineFormat(copy.input);
    let outputFilename = copy.output || path.basename(copy.input);
    let isStyleSheet = format === "scss" || format === "css";
    let newFile = await writeFile(
      path.join(options["output-dir"], outputFilename),
      format,
      {
        file: copy.input,
        fingerprint: isStyleSheet,
      }
    );
    if (isStyleSheet) {
      styleSheets.push(path.basename(newFile));
    }
  }
}

for (let linkConfig of config?.links || []) {
  if (linkConfig.outputDir) {
    let outputDir = path.join(options["output-dir"], linkConfig.outputDir);
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
        mainTitle: config?.title,
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

const indexContent = await generateIndex(index, config.linksSocial, {
  mainTitle: config?.title,
  avatar: avatarFilename,
  gravatar: config?.gravatar,
  favicon: config?.index?.copy?.find(
    (f) =>
      path.basename(f.input) === "favicon.ico" || f.output === "favicon.ico"
  ),
  mainStyleSheet: styleFilename,
  styleSheets,
  linksSocialPosition: config?.linksSocialPosition,
});

await fsPromises.writeFile(
  path.join(options["output-dir"], "index.html"),
  indexContent
);
