import type { Language } from './i18n'

export type ParameterHelpCopy = {
  title: string
  summary: string
  effect: string
  recommended?: string
  warning?: string
}

export type ParameterHelpKey =
  | 'inputMode'
  | 'preset'
  | 'hdrStrength'
  | 'highlightStart'
  | 'highlightRolloff'
  | 'shadowLift'
  | 'naturalSaturation'
  | 'detail'
  | 'headroom'
  | 'midtoneLock'
  | 'edgeAwareRadius'
  | 'edgeAwareEps'
  | 'clipGuard'
  | 'gainMapGamma'
  | 'whitePointGuard'
  | 'blackPointGuard'
  | 'gainMapResolution'
  | 'heicQuality'

export const parameterHelp: Record<Language, Record<ParameterHelpKey, ParameterHelpCopy>> = {
  en: {
    inputMode: {
      title: 'Input mode',
      summary: 'Choose between synthetic gain-map generation and using a supplied SDR base plus gain map.',
      effect: 'Single Image Enhance runs the percentile-based pipeline locally. Base + Gain Map bypasses synthetic generation and packages your pair.',
      recommended: 'Use Single Image Enhance for ordinary SDR photos. Use Base + Gain Map when you already have a prepared grayscale gain map.',
      warning: 'Synthetic gain maps cannot recover real scene HDR that is not present in the source image.',
    },
    preset: {
      title: 'Preset',
      summary: 'Starts from a tuned group of HDR gain-map controls.',
      effect: 'Changing a preset updates strength, highlight rolloff, natural saturation, smoothing, headroom, and clip guard together.',
      recommended: 'High HDR is a higher-headroom starting point. Bright scenes can use a lower-strength profile; Natural remains the conservative fallback.',
    },
    hdrStrength: {
      title: 'HDR strength',
      summary: 'Controls the maximum HDR boost in stops.',
      effect: 'Higher values make selected highlights expand further above the SDR base on compatible HDR/EDR displays.',
      recommended: 'Keep moderate unless the source has clear specular highlights.',
    },
    highlightStart: {
      title: 'Highlight start',
      summary: 'Selects which bright regions begin receiving HDR gain, based on luminance percentile.',
      effect: 'Lower values include more bright tones. Higher values keep gain focused on only the brightest areas.',
      recommended: 'Move down for flat images; move up when mids are being lifted.',
    },
    highlightRolloff: {
      title: 'Highlight rolloff',
      summary: 'Controls how gradually highlights reach the maximum boost.',
      effect: 'A wider percentile gap creates a softer shoulder. A narrower gap creates a more concentrated highlight lift.',
      recommended: 'Keep it above Highlight start and near the preset unless transitions look abrupt.',
    },
    shadowLift: {
      title: 'Shadow lift',
      summary: 'Lightly opens deep shadows in the reference preview while keeping the SDR base stable.',
      effect: 'The synthetic gain map remains highlight-led; shadow lift is intentionally subtle.',
      recommended: 'Use small values for underexposed images.',
    },
    naturalSaturation: {
      title: 'Natural saturation',
      summary: 'Adds vibrance to the SDR base while leaving already saturated colors mostly stable.',
      effect: 'Higher values make muted colors richer in the exported base image and HDR preview.',
      recommended: 'Use small values for portraits and product images; raise it when the SDR base looks flat.',
    },
    detail: {
      title: 'Detail',
      summary: 'Blends between a smoother gain map and a more detailed gain map.',
      effect: 'Higher values preserve sharper local highlight boundaries. Lower values create cleaner, softer gain maps.',
      recommended: 'Use lower values for portraits and product shots; raise it for small highlights.',
    },
    headroom: {
      title: 'Headroom',
      summary: 'Sets the intended maximum HDR expansion above the SDR base.',
      effect: 'This controls the gain-map metadata headroom and the clip guard ceiling.',
      recommended: 'Around 2 stops is a conservative default.',
    },
    midtoneLock: {
      title: 'Midtone lock',
      summary: 'Suppresses gain around mid gray so the whole image is not lifted.',
      effect: 'Higher values keep midtones closer to the SDR base while still allowing highlight expansion.',
      recommended: 'Use higher values when faces, walls, or neutral products become too bright.',
    },
    edgeAwareRadius: {
      title: 'Edge-aware smoothness',
      summary: 'Smooths the gain map while trying to avoid bleeding across strong luminance edges.',
      effect: 'Higher radius reduces noise and rough transitions. Lower radius keeps local detail tighter.',
      recommended: 'Use 6-14 px for most images.',
    },
    edgeAwareEps: {
      title: 'Edge threshold',
      summary: 'Controls how strongly the edge-aware smoother treats luminance changes as edges.',
      effect: 'Lower values preserve stronger edges. Higher values allow more smoothing across small tonal changes.',
      recommended: 'Leave near the preset unless halos or noisy masks appear.',
    },
    clipGuard: {
      title: 'Clip guard',
      summary: 'Softly reduces gain before highlights exceed the target headroom.',
      effect: 'Higher values are more conservative and reduce over-bright white clipping.',
      recommended: 'Use high values for product images and white backgrounds.',
    },
    gainMapGamma: {
      title: 'Gain-map gamma',
      summary: 'Controls the transfer curve used when quantizing log2 gain into the 8-bit gain map.',
      effect: 'Values below 1 favor lower gains. Values above 1 allocate more code values to subtle highlight gain.',
      recommended: 'Leave at 1.0 unless debugging quantization.',
    },
    whitePointGuard: {
      title: 'White guard',
      summary: 'Sets the high luminance percentile used to protect near-white regions.',
      effect: 'Lower values make the pipeline more conservative near white. Higher values allow stronger small highlights.',
      recommended: 'Keep high unless white backgrounds clip.',
    },
    blackPointGuard: {
      title: 'Black guard',
      summary: 'Sets the low luminance percentile used for shadow masking and fallback stability.',
      effect: 'Higher values broaden shadow protection. Lower values keep it limited to only the darkest pixels.',
      recommended: 'Leave near the preset for most images.',
    },
    gainMapResolution: {
      title: 'Gain-map resolution',
      summary: 'Controls the exported gain-map size and the tradeoff between file size and local detail.',
      effect: 'Lower values reduce file size. Higher values preserve local highlight boundaries in the auxiliary image.',
      recommended: 'Auto is a good default for most photos.',
      warning: 'Custom is currently reserved in the data model.',
    },
    heicQuality: {
      title: 'HEIC quality',
      summary: 'Controls final HEIC compression quality.',
      effect: 'Higher values reduce compression artifacts but increase export size and encoding time.',
      recommended: '80-90 is a practical range.',
    },
  },
  zh: {
    inputMode: {
      title: '输入模式',
      summary: '在合成 gain map 和使用已有 SDR 基图 + gain map 之间切换。',
      effect: '单图增强会在本地运行百分位高光管线。基图 + 增益图会绕过合成流程，直接封装你提供的图片对。',
      recommended: '普通 SDR 照片用单图增强。已有灰度 gain map 时用基图 + 增益图。',
      warning: '合成 gain map 不能恢复源图里不存在的真实场景 HDR 信息。',
    },
    preset: {
      title: '预设',
      summary: '从一组已调好的 HDR gain-map 控制项开始。',
      effect: '预设会同时更新强度、高光滚降、自然饱和度、平滑、headroom 和裁剪保护。',
      recommended: '高 HDR 是较高余量起点；明亮场景可使用更低强度的参数；Natural 仍是保守起点。',
    },
    hdrStrength: {
      title: 'HDR 强度',
      summary: '控制最大 HDR 提升档数。',
      effect: '数值越高，被选中的高光在兼容 HDR/EDR 显示上会比 SDR 基图扩展得更明显。',
      recommended: '除非源图有明确高光反射，否则保持中等强度。',
    },
    highlightStart: {
      title: '高光起点',
      summary: '按亮度百分位选择哪些亮部开始获得 HDR gain。',
      effect: '数值越低，更多亮部会进入处理；数值越高，gain 越集中在最亮区域。',
      recommended: '画面偏平时降低；中间调被抬亮时提高。',
    },
    highlightRolloff: {
      title: '高光滚降',
      summary: '控制高光逐步达到最大提升的速度。',
      effect: '百分位间隔越宽，高光肩部越柔和；间隔越窄，高光提升越集中。',
      recommended: '保持高于高光起点，除非过渡显得突兀。',
    },
    shadowLift: {
      title: '阴影抬升',
      summary: '在参考预览里轻微打开深阴影，同时保持 SDR 基图稳定。',
      effect: '合成 gain map 仍以高光为主；阴影抬升会保持克制。',
      recommended: '曝光不足的图片可以少量提高。',
    },
    naturalSaturation: {
      title: '自然饱和度',
      summary: '给 SDR 基图增加自然饱和度，同时尽量保持已高饱和颜色稳定。',
      effect: '数值越高，导出的基图和 HDR 预览里低饱和颜色越饱满。',
      recommended: '人像和产品图用小值；SDR 基图偏灰时再提高。',
    },
    detail: {
      title: '细节',
      summary: '在更平滑和更细节化的 gain map 之间混合。',
      effect: '数值越高，高光边界越清晰；数值越低，gain map 越干净柔和。',
      recommended: '人像和产品图用低值；小面积高光较多时提高。',
    },
    headroom: {
      title: 'Headroom',
      summary: '设置相对 SDR 基图的目标最大 HDR 扩展。',
      effect: '它会影响 gain-map metadata headroom 和裁剪保护上限。',
      recommended: '2 档左右是保守默认值。',
    },
    midtoneLock: {
      title: '中灰锁定',
      summary: '抑制中灰附近的 gain，避免整张图被抬亮。',
      effect: '数值越高，中间调越接近 SDR 基图，同时保留高光扩展。',
      recommended: '脸、墙面或中性色产品被抬亮时提高。',
    },
    edgeAwareRadius: {
      title: '边缘感知平滑',
      summary: '平滑 gain map，同时尽量避免跨过强亮度边缘扩散。',
      effect: '半径越大，噪声和粗糙过渡越少；半径越小，局部细节越紧。',
      recommended: '多数图片用 6-14 px。',
    },
    edgeAwareEps: {
      title: '边缘阈值',
      summary: '控制边缘感知平滑器把亮度变化视为边缘的敏感度。',
      effect: '数值越低，强边缘保留越多；数值越高，小的明暗变化会被更多平滑。',
      recommended: '除非看到光晕或噪声 mask，否则保持预设值。',
    },
    clipGuard: {
      title: '裁剪保护',
      summary: '在高光超过目标 headroom 前柔和降低 gain。',
      effect: '数值越高越保守，可以减少白色区域过曝裁剪。',
      recommended: '产品图和白底图建议使用较高值。',
    },
    gainMapGamma: {
      title: 'Gain-map gamma',
      summary: '控制把 log2 gain 量化到 8-bit gain map 时使用的曲线。',
      effect: '低于 1 会偏向较低 gain；高于 1 会给细微高光 gain 更多编码空间。',
      recommended: '除非调试量化，否则保持 1.0。',
    },
    whitePointGuard: {
      title: '白点保护',
      summary: '设置保护近白区域的高亮百分位。',
      effect: '数值越低，接近白色的区域越保守；数值越高，小面积高光可获得更强提升。',
      recommended: '除非白底裁剪，否则保持较高。',
    },
    blackPointGuard: {
      title: '黑点保护',
      summary: '设置阴影 mask 和极端输入稳定性使用的低亮度百分位。',
      effect: '数值越高，阴影保护范围越宽；数值越低，只限制最暗像素。',
      recommended: '大多数图片保持预设值。',
    },
    gainMapResolution: {
      title: 'Gain-map 分辨率',
      summary: '控制导出的 gain map 尺寸，以及文件大小与局部细节之间的取舍。',
      effect: '较低分辨率减小文件；较高分辨率保留辅助图里的高光边界细节。',
      recommended: 'Auto 适合大多数照片。',
      warning: 'Custom 目前只保留在数据模型中。',
    },
    heicQuality: {
      title: 'HEIC 质量',
      summary: '控制最终 HEIC 压缩质量。',
      effect: '数值越高，压缩伪影越少，但文件更大、编码更慢。',
      recommended: '80-90 是常用范围。',
    },
  },
}
