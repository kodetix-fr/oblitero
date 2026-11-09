import { noteInstalled } from './about.js';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

chrome.runtime.onInstalled.addListener((details) => noteInstalled(details).catch((error) => console.error('Oblitero:', error)));
