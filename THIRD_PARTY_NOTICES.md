# 数据与第三方声明

本项目应用代码采用根目录 MIT 许可；第三方内容保留各自权利与许可。原神及相关名称、游戏内容归其权利人所有，本项目为独立社区工具。

- **genshin-db 5.2.14 / theBowja**：角色、武器、天赋、材料与合成表。来源 https://github.com/theBowja/genshin-db 。MIT 全文见 `data/GENSHIN-DB-LICENSE.txt`。上游版本、完整性摘要和缺项在 `data/catalog.json` 的 `meta` 中；数据收录不表示已实装或账号已拥有。
- **AnimeGameData / DimbreathBot**：经验表参考 https://github.com/DimbreathBot/AnimeGameData ，固定来源提交由数据文件中的经验表元信息记录。游戏数据的权利不因本项目 MIT 许可转移。
- **哔哩哔哩游戏 Wiki · 原神**：机制和可再生来源索引参考 https://wiki.biligame.com/ys/ 。具体页面链接保留在代码与来源索引中。Wiki 内容按原站声明（CC BY-NC-SA）处理，不受本项目 MIT 许可重新授权；索引只提供摘要与链接，未打包整站页面或图片。
- **genshin.py / seriaati**：官方账号接口协议实现的参考资料，https://github.com/seriaati/genshin.py 。未打包其运行库。人机验证流程也参考官方战绩前端 https://webstatic.mihoyo.com/app/community-game-records/index.html 。
- **SeelieEx / KeyPJ 及贡献者**：账号同步相关逻辑适配自 https://github.com/KeyPJ/seelieEx ，固定参考提交 `c298631e9858ef6088b62c9b4c872ddd52c677a7`（2026-10-16 核对）。上游 README 的「许可」章节声明 MIT，未提供单独的 LICENSE 文件。对应文件：`src/adapters/common.ts`（设备标识注册）、`src/adapters/inventory-common.ts`（请求头底座、材料 ID 取最大值）、`src/adapters/genshin/hoyo.ts`（复用预取角色资料、材料计算基线与元素参数）。本项目将其适配为无运行依赖的 Node.js 实现，保留按需角色范围和库存下限标记；不分发整个油猴脚本，不采用失败后的递归二分重试。设备注册沿用上游固定兼容参数，不采集本机真实硬件或传感器信息。

  SeelieEx 相关适配部分保留 MIT 许可：Copyright (c) KeyPJ and SeelieEx contributors.

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
- **Node.js / OpenJS Foundation**：仅 Windows 便携发布包附带官方运行时；完整许可证与其第三方声明位于包内 `runtime/LICENSE.txt`。源码仓库不分发该二进制。

官方验证页面会按需加载极验官方组件；它不是离线包内的依赖。游戏账号接口与第三方资料的可用性、规则和版本由各自提供方决定。
