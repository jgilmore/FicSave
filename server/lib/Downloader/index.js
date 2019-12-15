const cheerio = require('cheerio');
const axios = require('axios');

const Epub = require('epub-gen');

class Downloader {
    constructor(url, selectors = {}) {
        this.url = this.constructor.getBaseUrl(url);
        this.html = '';
        this.selectors = {
            title: null,
            author: null,
            summary: null,
            metadata: null,
            cover_art: null,
            body: null,
            ...selectors,
        };
        this.data = null;
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
            publisher: this.url,
            cover: this.selectors.cover_art ? $(this.selectors.cover_art).first().attr('src') : null,
        };
        if (this.data.cover.startsWith('//')) {
            this.data.cover = `https:${this.data.cover}`;
        }
        this.fileName = `${this.data.title} - ${this.data.author}.epub`;
        this.data.output = `./tmp/${this.fileName}`;
        return this.fileName;
    }

    async download() {
        if (!this.data) {
            await this.fetchData();
        }
        const chapterList = this.getChapters();
        const buildChaptersPromises = [];
        chapterList.forEach((chapterTitle, index) => buildChaptersPromises.push(this.buildChapter(index + 1, chapterTitle)));
        this.data.content = await Promise.all(buildChaptersPromises);
        await (new Epub(this.data).promise);
        return this.data.output;
    }

    async fetchChapter(chapterUrl) {
        const response = await axios.get(chapterUrl);
        const $ = cheerio.load(response.data);
        return $(this.selectors.body).html();
    }

    async buildChapter(chapterNumber, chapterTitle) {
        const chapterUrl = this.getChapterUrl(chapterNumber);
        const chapterContent = await this.fetchChapter(chapterUrl);
        return {
            title: chapterTitle,
            data: chapterContent,
        };
    }
}

module.exports = Downloader;