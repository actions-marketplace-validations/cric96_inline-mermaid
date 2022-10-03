import {promises} from 'fs';
import {JSDOM} from 'jsdom';
import temp from 'temp';
import path from 'path';
import toml from 'toml';
import core from '@actions/core';
import {run} from '@mermaid-js/mermaid-cli';
import find from 'recursive-path-finder-regexp';

// Initialization
// temp.track() // manage clean of temporary file

// Utility functions
const zip = (a, b) => a.map((k, i) => [k, b[i]]);

/**
 * Load the mermaid configuration from a reveal-hugo toml configuration
 * @param {String} dirName - the folder in which the configuration is located
 * @param {String} cssFile - the cssFile used to the mermaid configuration
 * @return {Object} the configuration for the mermaid cli
 */
async function getMarmaidFromToml(dirName, cssFile) {
  const config = await promises.readFile(dirName);
  const data = await toml.parse(config.toString());
  return {
    parseMMDOptions: {
      backgroundColor: 'trasparent',
      mermaidConfig: data.params.reveal_hugo.mermaid[0],
      myCss: cssFile,
    },
  };
}

// Constants
const baseRegex = process.env.fileRegex;
const cssRegex = process.env.cssRegex;
const baseFolder = process.env.rootFolder;
const tomlFile = process.env.configFile;
core.info(
    'Configuration:\n' +
  `file-regex = ${baseRegex}\n` +
  `css-regex = ${cssRegex}\n` +
  `base folder = ${baseFolder}\n` +
  `toml configuration file = ${tomlFile}`,
);

const cssFile = find(
    new RegExp(cssRegex),
    {
      basePath: baseFolder,
      isAbsoluteResultsPath: true,
    },
);
if (cssFile && cssFile.length > 2) {
  core.setFailed(`
    The regex: ${cssRegex} match more then one file: \n  ${cssFile.join('\n')}`,
  );
}
const tomlConfiguration = getMarmaidFromToml(
    tomlFile,
  cssFile && cssFile.length == 1 ? cssFile[0] : undefined,
);
// Main functions
/**
 * Retrieve all index.html (starting from `dirName`)
 * and convert each mermaid code into svg code
 * (NB! rewrite the index that it find!)
 * @param {String} dirName - the root dir in which the search will happen
 */
async function rewritePages(dirName) {
  // get all index.html (in all sub directories)
  const files = await getHtmlIndexes(dirName);
  // load the js dom environment to find every .mermaid instances
  const fileLoaded = await Promise.all(files.map((file) => {
    console.log(file);
    return JSDOM.fromFile(file);
  }));
  // for each index, convert mermaid specification into plain svg code
  for (const element of zip(files, fileLoaded)) {
    await inlineSvgInPage(...element);
  }
}

/**
* Retrieve all index.html (starting from `dirName`)
* @param {String} dirName - the root dir in which the search will happen
* @return {Array} a list of all index.html
*/
async function getHtmlIndexes(dirName) {
  return find(
      new RegExp(baseRegex),
      {
        basePath: dirName,
        isAbsoluteResultsPath: true,
      },
  );
}
/**
* Giving an html page, inline each mermaid code into an svg
* NB! It produces a side effect (i.e., it rewrites the `fileName` passed)
* @param {String} fileName - the file that will be transformed
* @param {*} page - the js dom representation of the file passed
*/
async function inlineSvgInPage(fileName, page) {
  // Find all mermaid code
  const mermaidContent = page.window.document.querySelectorAll('.mermaid');
  const elementsToUpdate = Array.from(mermaidContent)
  // transfrom only the class that are not already transformed
      .filter((element) => element.attributes['data-processed'] === undefined);

  for (const element of elementsToUpdate) {
    // convert the mermaid code to svg code
    const svgContent = await getSvg(element);
    // put the svg code inside the mermaid div
    element.innerHTML = svgContent;
    // mark as already processed (mermaid.js will not process again)
    element.setAttribute('data-processed', 'true');
    // mark the div as pre-rendered
    element.setAttribute('pre-rendered', 'true');
  }
  // produce the side effect, i.e., writing the page with the svg inlined
  promises.writeFile(fileName, page.serialize());
}

/**
* Giving a div with a mermaid code,
* extract the svg representation using mermaid-cli
* @param {HTMLElement} element - the div tag with the mermaid code
* @return {String} - the svg representation of the given mermaid code
*/
async function getSvg(element) {
  // get the configuration from hugo toml
  const mermaidConfig = await tomlConfiguration;
  // temp file for file input (mermaid code)
  const htmlTemp = await temp.open({prefix: 'html-append', suffix: '.md'});
  // temp file for file output (svg)
  const svgTemp = await temp.open({prefix: 'svg-temp', suffix: '.svg'});
  const svgFilePath = path.parse(svgTemp.path);
  // prepare mermaid md
  const mermaidContent = '```mermaid\n' + element.textContent + '```';
  console.log(htmlTemp.path);
  try {
    // write the mermaid code inside the temp file
    const svgContent = await promises.writeFile(htmlTemp.path, mermaidContent)
        // call mermaid cli to transform mermaid code into svg
        .then(() => run(htmlTemp.path, svgTemp.path, mermaidConfig))
        // get the svg content
        .then(() => promises.readFile(
            svgFilePath.dir + '/' + svgFilePath.name + '-1.svg',
        ));
    return svgContent.toString();
  } catch (error) {
    throw Error(
        `Inline mermaid failed, mermaid content: \n` +
          `${mermaidContent} \n` +
          `cause: \n ${error}`,
        {cause: error},
    );
  }
}

rewritePages(baseFolder)
    .then((value) => console.log('Page rewriting complete!'));
