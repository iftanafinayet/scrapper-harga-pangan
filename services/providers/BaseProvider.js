/**
 * BaseProvider defines the interface for all scraping providers.
 */
class BaseProvider {
    constructor(name) {
        this.name = name;
    }

    /**
     * Main method to execute the scraping process.
     * @param {import('puppeteer').Page} page
     * @returns {Promise<Array>} Array of scraped items.
     */
    async scrape(page) {
        throw new Error('Method scrape() must be implemented by subclasses');
    }

    /**
     * Optional method to perform provider-specific setup (e.g., custom navigation).
     * @param {import('puppeteer').Page} page
     */
    async setup(page) {
        // Default implementation does nothing
    }
}

module.exports = BaseProvider;
