/**
 * 链接提取模块
 * 从文本中提取各种格式的URL
 */

/**
 * 从文本中提取URL
 * @param {string} text - 输入文本
 * @returns {string[]} - 提取到的URL数组
 */
function extractUrls(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const urls = new Set();

  // 1. 普通 http/https URL（包括端口、路径、查询参数）
  const httpRegex = /https?:\/\/[^\s\u4e00-\u9fa5\"<>{}|\^`\[\]]+/gi;
  const httpMatches = text.match(httpRegex);
  if (httpMatches) {
    httpMatches.forEach(url => urls.add(cleanUrl(url)));
  }

  // 2. 抖音分享链接（短链和长链）
  const douyinRegex = /(?:v\.douyin\.com|www\.douyin\.com|douyin\.com)\/[a-zA-Z0-9_\-/.?=&]+/gi;
  const douyinMatches = text.match(douyinRegex);
  if (douyinMatches) {
    douyinMatches.forEach(url => urls.add('https://' + url));
  }

  // 3. 微信公众号文章链接
  const mpRegex = /mp\.weixin\.qq\.com\/[a-zA-Z0-9_\-/.?=&]+/gi;
  const mpMatches = text.match(mpRegex);
  if (mpMatches) {
    mpMatches.forEach(url => urls.add('https://' + url));
  }

  // 4. B站链接
  const bilibiliRegex = /(?:bilibili\.com|b23\.tv)\/[a-zA-Z0-9_\-/.?=&]+/gi;
  const bilibiliMatches = text.match(bilibiliRegex);
  if (bilibiliMatches) {
    bilibiliMatches.forEach(url => urls.add('https://' + url));
  }

  // 5. 知乎链接
  const zhihuRegex = /(?:zhihu\.com|zhuanlan\.zhihu\.com)\/[a-zA-Z0-9_\-/.?=&]+/gi;
  const zhihuMatches = text.match(zhihuRegex);
  if (zhihuMatches) {
    zhihuMatches.forEach(url => urls.add('https://' + url));
  }

  // 6. 小红书链接
  const xhsRegex = /(?:xiaohongshu\.com|xhs\.link)\/[a-zA-Z0-9_\-/.?=&]+/gi;
  const xhsMatches = text.match(xhsRegex);
  if (xhsMatches) {
    xhsMatches.forEach(url => urls.add('https://' + url));
  }

  return Array.from(urls);
}

/**
 * 清理URL末尾的标点符号
 * @param {string} url - 原始URL
 * @returns {string} - 清理后的URL
 */
function cleanUrl(url) {
  return url.replace(/[.,;!?。，；！？"'"">)}\]]$/, '');
}

module.exports = { extractUrls };
