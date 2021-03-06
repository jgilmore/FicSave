const cheerio = require('cheerio');
const axios = require('axios');

const Epub = require('epub-gen');
const { EventEmitter } = require('events');

class Downloader extends EventEmitter {
    constructor(url, selectors = {}) {
        super();
        this.url = this.constructor.getBaseUrl(url);
        this.html = '';
        this.selectors = {
            title: null,
            author: null,
            summary: null,
            metadata: null,
            cover_art: null,
            body: null,
            description: null,
            ...selectors,
        };
        this.data = null;
        this.numChapters = 0;
        this.numChaptersFetched = 0;
    }

    /* eslint-disable */
    getChapters() { }

    static getBaseUrl(url) {
        return url;
    }

    getChapterUrl(chapterNumber) {}
    /* eslint-enable */

    async fetchData() {
        const response = await axios.get(this.url);
        this.html = response.data;
        const $ = cheerio.load(this.html);
        this.$ = $;
        this.data = {
            title: $(this.selectors.title).first().text().trim(),
            author: $(this.selectors.author).first().text().trim(),
            description: this.getDescription(),
            publisher: this.url,
            cover: this.selectors.cover_art ? $(this.selectors.cover_art).first().attr('src') : null,
            appendChapterTitles: false,
            css: `
                body {
                    font-family: 'Arial', sans-serif;
                }
            `
        };
        if (this.data.cover && this.data.cover.startsWith('//')) {
            this.data.cover = `https:${this.data.cover}`;
        }
        this.fileName = `${this.data.title} - ${this.data.author}.epub`;
        this.emit('fileName', this.fileName);
        this.data.output = `./tmp/${this.fileName}`;
        return this.fileName;
    }

    getDescription() {
        if (Array.isArray(this.selectors.description)) {
            return this.selectors.description
                .map(selector => this.$.html(this.$(selector)).trim())
                .join('\n');
        }
        return this.$.html(this.selectors.description).trim();
    }

    async download() {
        if (!this.data) {
            await this.fetchData();
        }
        this.emit('numChaptersFetched', 0);
        const chapterList = await this.getChapters();
        this.numChapters = chapterList.length;
        this.emit('numChapters', this.numChapters);
        let bookContents = [{
            title: `${this.data.title} by ${this.data.author}`,
            data: `
                <div style="text-align: center;">
                    <h1>${this.data.title}</h1>
                    <h3>by <em>${this.data.author}</em></h3>
                    <div style="text-align: left;">${this.data.description}</div>
                    <p style="text-align: left;">URL: <a href="${this.url}">${this.url}</a></p>
                </div>
            `,
            beforeToc: true,
        }];
        bookContents = bookContents.concat(
            await Promise.all(
                chapterList.map((chapterTitle, index) => this.buildChapter(index + 1, chapterTitle))
            )
        );
        this.data.content = bookContents;
        await (new Epub(this.data).promise);
        return {
            outputPath: this.data.output,
            fileName: this.fileName,
        };
    }

    async fetchChapter(chapterUrl) {
        const response = await axios.get(chapterUrl);
        const $ = cheerio.load(response.data);
        const body = $(this.selectors.body);
        body.find('*').each(function() {
            if (['A', 'IMG'].includes($(this).prop('tagName'))) {
                return;
            }
            this.attribs = {};
        });
        return body.html();
    }

    async buildChapter(chapterNumber, chapterTitle) {
        const chapterUrl = this.getChapterUrl(chapterNumber);
        const chapterContent = await this.fetchChapter(chapterUrl);
        this.emit('numChaptersFetched', ++this.numChaptersFetched);
        chapterTitle = chapterTitle.trim();
        if (chapterTitle) {
            chapterTitle = chapterTitle.replace(`${chapterNumber}. `, '');
        } else {
            chapterTitle = `Chapter ${chapterNumber}`;
        }
        const data = `
            <h2 style="text-align: center;">${chapterTitle}</h2>
            <div>
                ${chapterContent}
            </div>
        `;
        return {
            title: chapterTitle,
            data,
        };
    }
}

module.exports = Downloader;
