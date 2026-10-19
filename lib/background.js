/**
 * 先把 HTTP 响应发出去，再在常驻进程里发信和回复。
 * 进程一直活着，后台任务自己跑完即可。
 */

function defer(task) {
  return Promise.resolve().then(task).catch((error) => {
    console.error('[Background] 任务失败:', error);
  });
}

module.exports = { defer };
