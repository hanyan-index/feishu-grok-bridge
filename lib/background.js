/**
 * 把发信和回复放到响应之后执行。
 * 在 Vercel 上用 waitUntil 延长函数生命周期；本地进程里任务自己跑完即可。
 */

function defer(task) {
  const promise = Promise.resolve().then(task).catch((error) => {
    console.error('[Background] 任务失败:', error);
  });

  try {
    const { waitUntil } = require('@vercel/functions');
    waitUntil(promise);
  } catch (error) {
    console.error('[Background] waitUntil 不可用，任务继续在当前进程执行:', error.message);
  }

  return promise;
}

module.exports = { defer };
