import express from 'express'
import cheerio, { html } from "cheerio"
import { Readability } from '@mozilla/readability';
// @ts-ignore
import { gfm } from 'turndown-plugin-gfm';
import TurndownService from 'turndown';
import jsdom from 'jsdom'
const { JSDOM } = jsdom;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',

});

turndownService.use(gfm);

const getExt = (node) => {
  // Simple match where the <pre> has the `highlight-source-js` tags
  const getFirstTag = (node) =>
    node.outerHTML.split('>').shift() + '>';

  const match = node.outerHTML.match(
    /(highlight-source-|language-|lang-)[a-z]+/
  );

  if (match) return match[0].split('-').pop();

  // Checking for data-ch-lang or lang attributes
  const dataChLangMatch = node.outerHTML.match(/data-ch-lang="([^"]+)"/);
  if (dataChLangMatch) return dataChLangMatch[1];

  const langMatch = node.outerHTML.match(/lang="([^"]+)"/);
  if (langMatch) return langMatch[1];

  // Check the parent just in case
  const parent = getFirstTag(node.parentNode).match(
    /(highlight-source-|language-|lang-)[a-z]+/
  );

  if (parent) return parent[0].split('-').pop();

  const getInnerTag = (node) =>
    node.innerHTML.split('>').shift() + '>';


  const inner = getInnerTag(node).match(
    /(highlight-source-|language-|lang-)[a-z]+/
  );

  if (inner) return inner[0].split('-').pop();

  // Nothing was found...
  return '';
}

turndownService.addRule('fenceAllPreformattedText', {
  filter: ['pre'],

  replacement: function (content, node) {
    const ext = getExt(node);

    const code = [...node.childNodes]
      .map(c => c.textContent)
      .join('');

    return `\n\`\`\`${ext}\n${code}\n\`\`\`\n\n`;
  }
});

turndownService.addRule('strikethrough', {
  filter: ['del', 's'],

  replacement: function (content) {
    return '~' + content + '~';
  }
});

function extract_from_dom(dom) {
  let article = new Readability(dom.window.document, {
    keepClasses: true,
    debug: false,
    charThreshold: 100,
  }).parse();

  if (!article) {
    throw new Error("Failed to parse article");
  }
  // remove HTML comments
  article.content = article.content.replace(/(\<!--.*?\-->)/g, "");

  // Try to add proper h1 if title is missing
  if (article.title.length > 0) {

    // check if first h2 is the same as title
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/;
    const match = article.content.match(h2Regex);
    if (match?.[0].includes(article.title)) {
      // replace fist h2 with h1
      article.content = article.content.replace("<h2", "<h1").replace("</h2", "</h1")
    } else {
      // add title as h1
      article.content = `<h1>${article.title}</h1>\n${article.content}`
    }
  }
  // contert to markdown
  let res = turndownService.turndown(article.content);

  // replace weird header refs
  const pattern = /\[\]\(#[^)]*\)/g;
  res = res.replace(pattern, '')
  return res
}

async function extract_from_url(page) {
  const dom = await JSDOM.fromURL(page);
  return extract_from_dom(dom)
}

async function extract_from_html(html) {
  try {
	  const virtualConsole = new jsdom.VirtualConsole();
	  virtualConsole.on("error", () => {
		  // No-op to skip console errors.
	  });
	  const dom = new JSDOM(html, { virtualConsole });
	  return {
		status: 'success',
		markdown: extract_from_dom(dom)
	}
  } catch (error) {
	return {
		status: 'error',
		markdown: ''
	}
  }
}

const app = express();
const port = 3000;

app.use(express.json());


async function parseWeb(url){
	let startTime = Date.now()
	try {
		const abortController = new AbortController();
		setTimeout(() => abortController.abort(), 1000);
		try{
			const htmlString = await fetch(url, { signal: abortController.signal })
				.then((response) => response.text())
				.catch();

            let markdown = '';
            if (url.toLowerCase().endsWith('.md')) {
                markdown = htmlString;
            } else {
    			const $ = cheerio.load(htmlString);

    			//get html to markdown
    			let markdownResponse = await extract_from_html(htmlString)
    			
    			if (markdownResponse.status === 'error' || markdownResponse.markdown.length < 1000){
    				$('p, pre').each((i, elem) => {
    					if (elem.tagName === 'p') {
    						let pText = $(elem).text().trim()
    						markdown += pText + '\n'
    					} else if (elem.tagName === 'pre') {
    						let codeText = '\n```\n' + $(elem).text().trim() + '\n```\n'
    						markdown += codeText + '\n'
    					}
    				});
    			} else {
    				markdown = markdownResponse.markdown
    			}
            }
            markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
			return {
                markdown
            }
		} catch(e) {
			console.log("Error while parsing "+ url + ": ", e);
			return {
                markdown: null
            }
		}
	} catch (error) {
		console.error('Failed to fetch the webpage:', error);
		return {
            markdown: null
        }
	}
}


app.post('/parse-links', async (req, res) => {
    console.log('==>  Request received at ', Date.now())
    const linksArray = req.body.links; // assuming links are sent in the request body
    const MAX_N_PAGES_EMBED = 10; // adjust this value as needed

    const promises = linksArray.map(async link => {
        try {
            let result = await parseWeb(link);
            return {
                markdown: result.markdown,
                link
            };
        } catch (e) {
            // ignore errors
            return [];
        }
    });
    console.log('==> Response returned at ', Date.now())

    const nestedParagraphChunks = (await Promise.all(promises)).slice(0, MAX_N_PAGES_EMBED);

    res.json(nestedParagraphChunks);
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});