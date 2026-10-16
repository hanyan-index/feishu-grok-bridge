/**
 * 链接提取模块
 * 从文本中提取各种格式的URL
 */

// 主机标签边界：前面不能还是字母、数字或连字符。
// 点号、斜杠和字符串开头都算边界，所以 www.douyin.com 可以匹配，
// iesdouyin.com 里的 douyin.com、notbilibili.com 里的 bilibili.com 不会。
const HOST_BOUNDARY = '(?<![A-Za-z0-9-])';
const URL_TAIL = '[a-zA-Z0-9_\\-/.?=&]+';

const BARE_HOST_REGEXES = [
  // 更长的主机放前面，避免 www.iesdouyin.com 被截成 douyin.com
  new RegExp(
    HOST_BOUNDARY +
      '(?:www\\.iesdouyin\\.com|iesdouyin\\.com|v\\.douyin\\.com|www\\.douyin\\.com|douyin\\.com)/' +
      URL_TAIL,
    'gi'
  ),
  new RegExp(HOST_BOUNDARY + 'mp\\.weixin\\.qq\\.com/' + URL_TAIL, 'gi'),
  new RegExp(HOST_BOUNDARY + '(?:bilibili\\.com|b23\\.tv)/' + URL_TAIL, 'gi'),
  new RegExp(HOST_BOUNDARY + '(?:zhuanlan\\.zhihu\\.com|zhihu\\.com)/' + URL_TAIL, 'gi'),
  new RegExp(HOST_BOUNDARY + '(?:xiaohongshu\\.com|xhs\\.link)/' + URL_TAIL, 'gi')
];

const DOUYIN_WORK_PATH = /\/(video|note|slides)\/(\d+)/i;

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

  // 2. 没写协议的站点链接。已经落在某条完整 URL 里的不再另造一条。
  for (const regex of BARE_HOST_REGEXES) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (!matches) continue;
    matches.forEach(match => addBareUrl(urls, match));
  }

  return Array.from(urls);
}

/**
 * 同一条抖音作品只留一个链接。
 * 路径里的 /video|note|slides/<数字 id> 相同即视为同一作品。
 * 优先保留 iesdouyin / v.douyin 原始链接，丢掉从主机名中间截出来的 douyin.com。
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupeSameWorkUrls(urls) {
  const result = [];
  const indexByWork = new Map();

  for (const url of urls || []) {
    const key = douyinWorkKey(url);
    if (!key) {
      result.push(url);
      continue;
    }
    const existingIndex = indexByWork.get(key);
    if (existingIndex === undefined) {
      indexByWork.set(key, result.length);
      result.push(url);
      continue;
    }
    if (preferDouyinUrl(url, result[existingIndex]) < 0) {
      result[existingIndex] = url;
    }
  }

  return result;
}

function addBareUrl(urls, hostAndPath) {
  const cleaned = cleanUrl(hostAndPath);
  if (!cleaned || coveredByExistingUrl(urls, cleaned)) return;
  urls.add('https://' + cleaned);
}

/**
 * 裸主机匹配如果只是某条已提取 URL 的同一地址（或被从主机名中间切开），就丢掉。
 * @param {Set<string>} urls
 * @param {string} bare
 * @returns {boolean}
 */
function coveredByExistingUrl(urls, bare) {
  for (const existing of urls) {
    const body = existing.replace(/^https?:\/\//i, '');
    if (body === bare) return true;
    if (body.startsWith(bare)) {
      const next = body[bare.length] || '';
      if (!next || /[^A-Za-z0-9_]/.test(next)) return true;
    }
    if (body.length > bare.length && body.endsWith(bare)) {
      const before = body[body.length - bare.length - 1];
      if (before === '.' || /[A-Za-z0-9-]/.test(before)) return true;
    }
  }
  return false;
}

function douyinWorkKey(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return null;
  }
  if (!isDouyinHost(parsed.hostname)) return null;
  const match = parsed.pathname.match(DOUYIN_WORK_PATH);
  if (!match) return null;
  return `${match[1].toLowerCase()}:${match[2]}`;
}

function isDouyinHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'douyin.com'
    || host.endsWith('.douyin.com')
    || host === 'iesdouyin.com'
    || host.endsWith('.iesdouyin.com');
}

/**
 * 数值越小越该留下。iesdouyin 长链和 v.douyin 短链优先于裸 douyin.com。
 * @param {string} candidate
 * @param {string} current
 * @returns {number}
 */
function preferDouyinUrl(candidate, current) {
  const rank = douyinHostRank(candidate) - douyinHostRank(current);
  if (rank !== 0) return rank;
  if (candidate.length !== current.length) return current.length - candidate.length;
  return 0;
}

function douyinHostRank(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (error) {
    return 9;
  }
  if (host === 'iesdouyin.com' || host.endsWith('.iesdouyin.com')) return 0;
  if (host === 'v.douyin.com') return 1;
  if (host === 'www.douyin.com') return 2;
  if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 3;
  return 4;
}

/**
 * 清理URL末尾的标点符号
 * @param {string} url - 原始URL
 * @returns {string} - 清理后的URL
 */
function cleanUrl(url) {
  return url.replace(/[.,;!?。，；！？"'"">)}\]]$/, '');
}

module.exports = { extractUrls, dedupeSameWorkUrls };
