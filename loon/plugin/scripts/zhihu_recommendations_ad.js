/**
 * 知乎推荐接口去广告脚本
 * 过滤 /api/v4/answers/{id}/recommendations 接口返回的广告数据
 */

let body;

try {
    body = JSON.parse($response.body);
} catch (e) {
    $done({});
    return;
}

if (body.data && Array.isArray(body.data)) {
    // 过滤掉 type 为 "ad" 的广告数据
    body.data = body.data.filter(item => {
        if (item.type === "ad") return false;
        if (item.ad_info && item.ad_info.ad) return false;
        return true;
    });

    // 更新分页信息
    if (body.paging) {
        body.paging.totals = body.data.length;
    }
}

$done({ body: JSON.stringify(body) });
