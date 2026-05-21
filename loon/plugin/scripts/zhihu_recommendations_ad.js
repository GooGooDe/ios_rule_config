/**
 * 知乎推荐接口去广告脚本
 * 过滤 /api/v4/answers/{id}/recommendations 接口返回的广告数据
 */
let body;

try {
    // 解析接口返回的JSON
    body = JSON.parse($response.body);
} catch (e) {
    // 解析失败直接返回原数据
    $done({});
    return;
}

// 核心：过滤广告
if (body.data && Array.isArray(body.data)) {
    // 只保留 非ad类型 的数据
    body.data = body.data.filter(item => item.type !== "ad");
    
    // 同步更新总条数，避免页面显示异常
    if (body.paging) {
        body.paging.totals = body.data.length;
        // 无数据时标记为最后一页
        if (body.data.length === 0) {
            body.paging.is_end = true;
        }
    }
}

// 返回处理后的数据
$done({ body: JSON.stringify(body) });