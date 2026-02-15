try {
    localStorage.removeItem('zarpadoCart');
} catch (error) {
    // Storage can be blocked by the browser; ignore to avoid breaking the page.
}
