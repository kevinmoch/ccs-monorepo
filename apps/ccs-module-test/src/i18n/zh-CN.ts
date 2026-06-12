/**
 * 中文国际化资源
 * 按领域（domain）组织，使用嵌套结构避免 key 冲突。
 */
export default {
  attendance: {
    // AttendanceShiftCard
    shiftInfo: '今日班次',
    flexWindow: '弹性窗口',
    minutes: '分钟',
    attendanceRange: '考勤范围',
    mobilePunch: '移动打卡',
    checkInTitle: '上班',
    checkOutTitle: '下班',
    target: '目标',
    notPunched: '未打卡',
    meter: '米',

    // AttendanceTitleCard
    attendance: '考勤打卡',
    locale: 'zh-CN',
    statusDone: '今日已完成',
    statusIn: '已上班，待下班打卡',
    statusPending: '待上班打卡',

    // AttendanceListCard
    locationMethod: '定位方式',

    // AttendanceGeolocationCard
    currentTime: '当前时间',
    locating: '定位中...',
    updateLocation: '更新定位',
    checkIn: '上班打卡',
    checkOut: '下班打卡',
    waitingLocation: '等待获取当前位置',
    accuracyPrefix: '定位精度约',

    // Store: accuracyLevel
    accuracyHigh: '高精度',
    accuracyOk: '可用',
    accuracyReview: '需复核',
    accuracyNone: '未定位'
  },

  offlineDocs: {
    // OfflineDocsTitleCard
    offlineDocs: '离线文档',
    online: '在线',
    offline: '离线',
    usedSpace: '已用空间',
    quota: '浏览器配额',
    offlineStorage: '离线存储',
    available: '可用',
    unavailable: '不可用',

    // OfflineDocsListCard
    docList: '文档列表',
    checking: '检查中',
    checkUpdates: '检查更新',
    documents: '个文档',
    loading: '正在加载文档清单',
    selectToClear: '选择清理缓存',
    noCache: '暂无缓存',
    updated: '更新',
    cached: '缓存',
    docSite: '文档站点',
    remoteDoc: '远程文档',
    resuming: '续传中',
    downloading: '下载中',
    viewOnline: '在线查看',
    cacheLocal: '缓存本地',
    viewOffline: '离线查看',
    updateCache: '更新缓存',
    deleteCache: '删除缓存',
    statusNotDownloaded: '未下载',
    statusDownloading: '下载中',
    statusOffline: '已离线',
    statusUpdateAvailable: '有更新',
    statusFailed: '中断',

    // OfflineDocsCacheCard
    cacheMgmt: '缓存管理',
    cachedFiles: '缓存文件',
    partialFiles: '中断文件',
    metadata: '元数据',
    selected: '已选择',
    lruHint: '启用 LRU 整理',
    clearSelected: '清除所选',
    clearOldest: '清理最久未访问',
    clearAll: '全部清除',

    // Store: pressureLabel
    opfsUnavailable: 'OPFS 不可用',
    spaceMonitoring: '空间监测中',
    spaceTight: '空间紧张',
    spaceNearWatermark: '接近建议水位',
    spaceNormal: '空间正常',

    // Store: actions & helpers (page messages)
    offlineCantOpenOnline: '当前离线，无法打开在线文档',
    noCacheAvailable: '本地没有可用缓存，请先缓存本地',
    cacheMismatch: '本地缓存文件与服务器清单不一致，请更新缓存后再打开',
    preparingDownload: '准备下载',
    cacheUpdated: '已更新缓存：{title}',
    cacheLocalDone: '已缓存本地：{title}',
    offlineCantCheckUpdates: '当前离线，无法检查服务器更新',
    updateCheckDone: '更新检查完成',
    lruCleared: '已按 LRU 清理：{title}',
    notRecorded: '未记录'
  },

  offlinePhoto: {
    // OfflinePhotoTitleCard
    offlinePhoto: '离线拍照',
    total: '共',
    photos: '张',
    usedSpace: '已用空间',
    offlineStorage: '离线存储',
    available: '可用',
    unavailable: '不可用',

    // OfflinePhotoCameraCard
    photoCapture: '拍照采集',
    allPhotosOffline: '照片先离线保存，再按需上传',
    capturing: '处理中...',
    nativeCapture: '调用相机拍照',
    webCapture: '打开相机拍照',
    cancel: '取消',
    saving: '保存中...',
    takePhoto: '拍照',
    cannotOpenCamera: '无法打开相机',
    cameraNotReady: '相机尚未就绪',
    canvasUnsupported: '不支持画布抓帧',
    captureFailed: '抓帧失败',

    // OfflinePhotoListCard
    offlinePhotos: '离线照片',
    loading: '正在加载离线相册',
    noPhotosHint: '还没有照片，点击拍照按钮开始',
    noPreview: '无预览',
    view: '查看',
    delete: '删除',

    // common
    close: '关闭',

    // OfflinePhotoUploadCard
    uploadPhoto: '上传图片',
    uploadUrl: '上传地址',
    uploading: '上传中...',
    upload: '上传所选',

    // OfflinePhotoCacheCard
    albumMgmt: '相册管理',
    selected: '已选',
    photoFiles: '照片文件',
    metadata: '元数据',
    deleteSelected: '删除所选',
    clearAll: '全部清除',

    // Store: state & actions
    detecting: '检测中',
    storageUnavailable: '当前环境不支持离线照片存储',
    photoSavedOffline: '已离线保存照片',
    selectedPhotosDeleted: '已删除所选照片',
    allPhotosCleared: '已清空离线照片',
    selectPhotosFirst: '请先在列表中勾选要上传的照片',
    enterUploadUrl: '请填写上传地址',
    uploadingProgress: '上传中 ({current}/{total})...',
    photosUploaded: '{count} 张上传成功',
    photosFailed: '{count} 张失败',
    uploadComplete: '上传完成',

    // Store: display helpers
    localOnly: '仅本地',
    uploaded: '已上传',
    uploadFailed: '上传失败',
    camera: '相机',
    file: '文件',
    notRecorded: '未记录',
    unknownDimension: '尺寸未知'
  }
};
