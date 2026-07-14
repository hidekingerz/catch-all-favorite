import { defineComponents } from "blume";

export default defineComponents({
  layout: {
    // 記事下の注入ポイントを使って、サイドバーのスクロール位置維持スクリプトを全ページに読み込む
    PageFooter: "./components/SidebarScroll.astro",
  },
});
