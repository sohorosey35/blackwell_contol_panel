const path = require('path')
module.exports = {
  version: "1.0",
  title: "Blackwell Control Panel",
  description: "Blackwell Control Panel Web UI",
  menu: async (kernel, info) => {
    let running = {
      start: info.running("start.js")
    }
    if (running.start) {
      let local = info.local("start.js")
      if (local && local.url) {
        return [{
          default: true,
          icon: "fa-solid fa-rocket",
          text: "Open Web UI",
          href: "http://comfyui-07:8084",
        }, {
          icon: 'fa-solid fa-terminal',
          text: "Terminal",
          href: "start.js",
        }]
      } else {
        return [{
          default: true,
          icon: 'fa-solid fa-terminal',
          text: "Terminal",
          href: "start.js",
        }]
      }
    } else {
      return [{
        default: true,
        icon: "fa-solid fa-power-off",
        text: "Start",
        href: "start.js",
      }]
    }
  }
}
