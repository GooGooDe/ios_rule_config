/**
 * 高德地图接口去广告脚本
 * 过滤 Amap (com.autonavi.minimap) 返回数据中的广告字段与节点
 *
 * 覆盖场景：
 *   - 开屏 / 启动页广告 (splash)
 *   - 首页 banner / 信息流 / 运营位
 *   - 搜索结果推广、周边推荐推广
 *   - 打车 / 出行推广
 *   - 我的页面推广位
 *
 * 策略：
 *   1) 从响应体中递归剔除已知的广告字段（ad、cpc、banner、splash、promotion 等）
 *   2) 对常见 list 对象做类型过滤，移除 type / tag 标识为广告的项
 *   3) 解析失败时直接返回原始 body，保证 App 可用
 */

(function () {
    // 已知广告字段白名单 —— 一旦命中直接删除
    // 列表覆盖 amap_configer.data 中常见开关字段以及业务接口中的广告容器
    const AD_KEYS = [
        // 顶层 / 配置类
        "ad_enable", "cpc_enable", "banner_enable", "splash_ad_enable",
        "adSwitch", "ad_switch", "promotionSwitch", "promotion_switch",
        "Recommend", "alibaba_recommend", "recommend",
        // 业务广告容器
        "ad", "ads", "AD", "Ad", "adList", "ad_list", "adInfos", "ad_infos",
        "cpc", "cpcList", "cpc_list", "cpc_infos",
        "banner", "banners", "bannerList", "banner_list", "topBanner", "top_banner",
        "splash", "splashAd", "splash_ad", "splash_list", "splashList",
        "promotion", "promotions", "promo", "promoList",
        "marketing", "marketingList", "marketing_info",
        "operation", "operationInfo", "operation_info",
        "float_ad", "floatAd", "popAd", "pop_ad", "popup_ad",
        "reward_ad", "rewardAd",
        // 搜索 / 周边推荐
        "search_ad", "searchAd", "searchPromotion", "search_promotion",
        "nearby_ad", "nearbyAd", "around_ad", "aroundAd",
        // 打车 / 出行推广
        "taxi_ad", "taxi_promotion", "ride_ad",
        // 我的页面推广位
        "mine_banner", "mine_ad", "profile_ad", "profileBanner",
    ];

    // 表明"这是广告"的 type / tag 取值
    const AD_TYPE_VALUES = [
        "ad", "AD", "Ad", "advertisement",
        "cpc", "CPC", "banner", "splash", "splash_ad",
        "promotion", "promo", "marketing", "operation",
        "推广", "广告", "开屏广告", "运营位",
    ];

    /**
     * 判断字符串是否匹配广告关键词
     */
    function isAdString(val) {
        if (typeof val !== "string") return false;
        const v = val.trim();
        if (!v) return false;
        for (let i = 0; i < AD_TYPE_VALUES.length; i++) {
            if (v === AD_TYPE_VALUES[i]) return true;
        }
        // 宽松匹配：只在较短值时命中，避免误伤
        if (v.length <= 12) {
            const lv = v.toLowerCase();
            for (let i = 0; i < AD_TYPE_VALUES.length; i++) {
                if (lv.indexOf(AD_TYPE_VALUES[i].toLowerCase()) !== -1) return true;
            }
        }
        return false;
    }

    /**
     * 递归清理：
     *   - 删除 key 命中 AD_KEYS 的字段
     *   - 对数组中的对象，若存在 type / tag / item_type / ad_type 等字段命中广告，则移除该 item
     */
    function cleanup(obj, depth) {
        if (depth === undefined) depth = 0;
        if (depth > 40) return obj; // 保护递归上限
        if (obj === null || obj === undefined) return obj;

        if (Array.isArray(obj)) {
            const keep = [];
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i];
                if (item && typeof item === "object") {
                    // 明确标识为广告的 item 直接丢弃
                    const typeField =
                        item.type !== undefined ? item.type :
                        item.tag !== undefined ? item.tag :
                        item.item_type !== undefined ? item.item_type :
                        item.ad_type !== undefined ? item.ad_type :
                        item.adType !== undefined ? item.adType :
                        item.adFlag !== undefined ? item.adFlag :
                        item.is_ad !== undefined ? (item.is_ad ? "ad" : undefined) :
                        item.isAd !== undefined ? (item.isAd ? "ad" : undefined) :
                        undefined;
                    if (typeField !== undefined && isAdString(String(typeField))) {
                        continue;
                    }
                    keep.push(cleanup(item, depth + 1));
                } else if (typeof item === "string") {
                    // 字符串数组中的纯广告标识也移除
                    if (isAdString(item)) continue;
                    keep.push(item);
                } else {
                    keep.push(item);
                }
            }
            return keep;
        }

        if (typeof obj === "object") {
            const keys = Object.keys(obj);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                // 匹配广告 key —— 删除
                if (AD_KEYS.indexOf(k) !== -1) {
                    delete obj[k];
                    continue;
                }
                // 对容器值递归处理
                const v = obj[k];
                if (v && typeof v === "object") {
                    obj[k] = cleanup(v, depth + 1);
                }
            }
        }
        return obj;
    }

    // === 主逻辑 ===
    let body;
    try {
        body = JSON.parse($response.body);
    } catch (e) {
        // 非 JSON 响应直接放行，保证 App 正常工作
        $done({});
        return;
    }

    if (!body || typeof body !== "object") {
        $done({});
        return;
    }

    const cleaned = cleanup(body, 0);

    // 同步部分 list 长度字段，避免 UI 异常
    try {
        if (cleaned && typeof cleaned === "object") {
            const syncLen = (parent, listKey, totalKey) => {
                if (!parent || !Array.isArray(parent[listKey])) return;
                if (typeof parent[totalKey] === "number") {
                    // 以过滤后的实际数量为准，保守策略
                    parent[totalKey] = parent[listKey].length;
                }
            };
            // 常见分页字段配对
            const pairs = [
                ["data", "total"], ["data", "totals"], ["data", "count"],
                ["list", "total"], ["list", "totals"], ["list", "count"],
                ["items", "total"], ["items", "totals"], ["items", "count"],
                ["feeds", "total"], ["feeds", "totals"],
            ];
            for (let i = 0; i < pairs.length; i++) {
                syncLen(cleaned, pairs[i][0], pairs[i][1]);
                if (cleaned[pairs[i][0]] && typeof cleaned[pairs[i][0]] === "object") {
                    syncLen(cleaned[pairs[i][0]], "list", "total");
                    syncLen(cleaned[pairs[i][0]], "items", "total");
                }
            }
        }
    } catch (_) {
        // 长度同步失败不影响主流程
    }

    $done({ body: JSON.stringify(cleaned) });
})();
