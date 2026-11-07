# GISTable

公路遥感监测与巡查执法管理平台。

项目采用 Vue 3、TypeScript、Vite、OpenLayers。地图、业务要素和数据访问分层组织；正式后端、空间数据库及私有影像服务按《系统架构与实施执行规范 v1.1》逐步接入。

## 在线工作台

预期发布地址：https://ktimxfgit.github.io/GISTable/

## 本地运行

```bash
cd frontend
npm install
npm run dev
```

构建：

```bash
cd frontend
npm run check:ui
npm run build
```

Node.js 推荐 22 LTS。GitHub Pages 使用 `/GISTable/` 子路径；本地及正式环境通过构建变量设置 `VITE_BASE_PATH`。

## 数据说明

`frontend/public/sample-data/objects.geojson` 包含用于软件界面及 GIS 操作验证的合成线路与点要素，不对应真实公路资产、巡查结论或执法证据，不能作为公路管理和执法依据。地图底图来自 OpenStreetMap，须保留数据来源署名并遵守瓦片使用政策。

静态站点中的用户绘制要素仅在浏览器当前工作区，支持实际导入和导出 GeoJSON，不代表已经持久化到服务器。正式业务数据、账号和影像文件不能放入这个公开仓库。

## 设计文档

[系统架构与实施执行规范 v1.1](docs/GISTable_系统架构与实施执行规范_v1.1.md)
