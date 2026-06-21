/**
 * 高德地图接口去广告脚本
 * 过滤 Amap (com.autonavi.minimap) 返回数据中的广告字段与节点
 *
 * 覆盖场景（可通过 Loon 插件 UI 开关独立控制）：
 *   - 开屏 / 启动页广告 (splash)
 *   - 首页 banner / 信息流 / 运营位
 *   - 搜索结果推广、周边推荐推广
 *   - 打车 / 出行推广
 *   - 我的页面推广位
 *   - 第三方广告 SDK 请求
 *
 * 策略：
 *   1) 从响应体中递归剔除已知的广告字段（ad、cpc、banner、splash、promotion 等）
 *   2) 对常见 list 对象做类型过滤，移除 type / tag 标识为广告的项
 *   3) 解析失败时直接返回原始 body，保证 App 可用
 *
 * 参数（由 Loon 插件传入 argument）：
 *   $argument.switch_splash  — 开启/关闭 开屏/启动页广告过滤，默认 true
 *   $argument.switch_home    — 开启/关闭 首页/信息流/banner 广告过滤，默认 true
 *   $argument.switch_search  — 开启/关闭 搜索/周边推荐广告过滤，默认 true
 *   $argument.switch_ride   — 开启/关闭 打车/出行广告过滤，默认 true
 *   $argument.switch_mine   — 开启/关闭 我的页面广告过滤，默认 true
 */

(function () {
    // ========== 用户开关（Loon 传入，未传则默认全部开启）==========

    // 是否过滤开屏 / 启动页广告（splash、launch、startup、ad_info 等路径的响应）
    var ENABLE_SPLASH = ($argument && $argument.switch_splash !== undefined)
        ? $argument.switch_splash
        : true;

    // 是否过滤首页 / 信息流 / banner 广告
    var ENABLE_HOME = ($argument && $argument.switch_home !== undefined)
        ? $argument.switch_home
        : true;

    // 是否过滤搜索 / 周边推荐广告
    var ENABLE_SEARCH = ($argument && $argument.switch_search !== undefined)
        ? $argument.switch_search
        : true;

    // 是否过滤打车 / 出行推广广告
    var ENABLE_RIDE = ($argument && $argument.switch_ride !== undefined)
        ? $argument.switch_ride
        : true;

    // 是否过滤我的页面推广广告
    var ENABLE_MINE = ($argument && $argument.switch_mine !== undefined)
        ? $argument.switch_mine
        : true;

    // ========== 广告字段 / 类型定义 ==========

    // 已知广告字段 —— 一旦命中直接删除
    var AD_KEYS = [
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

    // 开屏相关广告字段（开关 switch_splash 控制）
    var SPLASH_AD_KEYS = [
        "splash", "splashAd", "splash_ad", "splash_list", "splashList",
        "launch", "launchAd", "launch_ad",
        "startup", "startupAd", "startup_ad",
        "ad_info", "adInfo", "adInfo_list", "ad_info_list",
        "ad_pop", "adPop", "popups",
        "boot_ad", "bootAd", "boot_splash",
        "intro_ad", "introAd",
    ];

    // 首页 / 信息流相关广告字段（开关 switch_home 控制）
    var HOME_AD_KEYS = [
        "banner", "banners", "bannerList", "banner_list", "topBanner", "top_banner",
        "operation", "operationInfo", "operation_info",
        "marketing", "marketingList", "marketing_info",
        "feeds", "feedList", "feed_list", "feed_ad",
        "hot_feed", "hotFeed",
        "recommend", "Recommend", "alibaba_recommend",
        "float_ad", "floatAd", "floatBanner",
        "pop_ad", "popAd", "popBanner",
        "popup_ad", "popupBanner",
        "home_ad", "homeAd", "homeBanner",
        "index_ad", "indexAd",
        "entrance_ad", "entranceAd",
        "icon_ad", "iconAd",
    ];

    // 搜索 / 周边相关广告字段（开关 switch_search 控制）
    var SEARCH_AD_KEYS = [
        "search_ad", "searchAd", "searchPromotion", "search_promotion",
        "poi_ad", "poiAd", "poi_promotion", "poiPromotion",
        "nearby_ad", "nearbyAd", "around_ad", "aroundAd",
        "map_ad", "mapAd",
        "navigation_ad", "navigationAd",
        "route_ad", "routeAd",
    ];

    // 打车 / 出行相关广告字段（开关 switch_ride 控制）
    var RIDE_AD_KEYS = [
        "taxi_ad", "taxi_promotion", "taxiBanner",
        "ride_ad", "ridePromotion",
        "car_hailing", "carsharing",
        "travel_ad", "travelPromotion",
        "bus_ad", "busPromotion",
        "train_ad", "trainPromotion",
        "flight_ad", "flightPromotion",
        "driver_ad", "driverPromo",
    ];

    // 我的页面相关广告字段（开关 switch_mine 控制）
    var MINE_AD_KEYS = [
        "mine_banner", "mine_ad", "mineBanner",
        "profile_ad", "profileBanner", "profile_ad",
        "user_ad", "userBanner",
        "personal_ad", "personalBanner",
        "member_ad", "memberBanner",
        "vip_ad", "vipBanner",
        "privilege_ad", "privilegeBanner",
        "points_ad", "pointsBanner",
    ];

    // 表明"这是广告"的 type / tag 取值
    var AD_TYPE_VALUES = [
        "ad", "AD", "Ad", "advertisement",
        "cpc", "CPC", "banner", "splash", "splash_ad",
        "promotion", "promo", "marketing", "operation",
        "推广", "广告", "开屏广告", "运营位",
    ];

    // ========== 工具函数 ==========

    /**
     * 判断字符串是否匹配广告关键词
     */
    function isAdString(val) {
        if (typeof val !== "string") return false;
        var v = val.trim();
        if (!v) return false;
        for (var i = 0; i < AD_TYPE_VALUES.length; i++) {
            if (v === AD_TYPE_VALUES[i]) return true;
        }
        // 宽松匹配：只在较短值时命中，避免误伤
        if (v.length <= 12) {
            var lv = v.toLowerCase();
            for (var j = 0; j < AD_TYPE_VALUES.length; j++) {
                if (lv.indexOf(AD_TYPE_VALUES[j].toLowerCase()) !== -1) return true;
            }
        }
        return false;
    }

    /**
     * 检查当前广告 key 所属分类
     */
    function getAdCategory(key) {
        if (SPLASH_AD_KEYS.indexOf(key) !== -1)   return "splash";
        if (HOME_AD_KEYS.indexOf(key) !== -1)       return "home";
        if (SEARCH_AD_KEYS.indexOf(key) !== -1)    return "search";
        if (RIDE_AD_KEYS.indexOf(key) !== -1)     return "ride";
        if (MINE_AD_KEYS.indexOf(key) !== -1)     return "mine";
        return "common";
    }

    /**
     * 判断某分类开关是否开启
     */
    function isCategoryEnabled(category) {
        switch (category) {
            case "splash":  return !!ENABLE_SPLASH;
            case "home":    return !!ENABLE_HOME;
            case "search":  return !!ENABLE_SEARCH;
            case "ride":    return !!ENABLE_RIDE;
            case "mine":    return !!ENABLE_MINE;
            default:        return true; // 通用广告字段（ad、cpc 等）始终拦截
        }
    }

    /**
     * 递归清理：
     *   - 根据分类开关决定是否删除命中 AD_KEYS 的字段
     *   - 对数组中的对象，若存在 type / tag 等字段命中广告，则移除该 item
     */
    function cleanup(obj, depth) {
        if (depth === undefined) depth = 0;
        if (depth > 40) return obj; // 保护递归上限
        if (obj === null || obj === undefined) return obj;

        if (Array.isArray(obj)) {
            var keep = [];
            for (var i = 0; i < obj.length; i++) {
                var item = obj[i];
                if (item && typeof item === "object") {
                    // 明确标识为广告的 item 直接丢弃
                    var typeField =
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
                    if (isAdString(item)) continue;
                    keep.push(item);
                } else {
                    keep.push(item);
                }
            }
            return keep;
        }

        if (typeof obj === "object") {
            var keys = Object.keys(obj);
            for (var k = 0; k < keys.length; k++) {
                var key = keys[k];
                // 先检查是否是通用广告字段（ad、cpc 等）—— 始终拦截
                var isCommon = AD_KEYS.indexOf(key) !== -1;
                if (isCommon) {
                    delete obj[key];
                    continue;
                }
                // 再检查是否属于特定分类广告字段
                var category = getAdCategory(key);
                if (category !== "common" && !isCategoryEnabled(category)) {
                    // 该分类开关关闭，保留字段不做处理
                    continue;
                }
                // 对容器值递归处理
                var v = obj[key];
                if (v && typeof v === "object") {
                    obj[key] = cleanup(v, depth + 1);
                }
            }
        }
        return obj;
    }

    // ========== 主逻辑 ==========
    var body;
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

    var cleaned = cleanup(body, 0);

    // 同步部分 list 长度字段，避免 UI 异常
    try {
        if (cleaned && typeof cleaned === "object") {
            var syncLen = function(parent, listKey, totalKey) {
                if (!parent || !Array.isArray(parent[listKey])) return;
                if (typeof parent[totalKey] === "number") {
                    parent[totalKey] = parent[listKey].length;
                }
            };
            var pairs = [
                ["data", "total"], ["data", "totals"], ["data", "count"],
                ["list", "total"], ["list", "totals"], ["list", "count"],
                ["items", "total"], ["items", "totals"], ["items", "count"],
                ["feeds", "total"], ["feeds", "totals"],
            ];
            for (var p = 0; p < pairs.length; p++) {
                syncLen(cleaned, pairs[p][0], pairs[p][1]);
                if (cleaned[pairs[p][0]] && typeof cleaned[pairs[p][0]] === "object") {
                    syncLen(cleaned[pairs[p][0]], "list", "total");
                    syncLen(cleaned[pairs[p][0]], "items", "total");
                }
            }
        }
    } catch (_) {}

    $done({ body: JSON.stringify(cleaned) });
})();
