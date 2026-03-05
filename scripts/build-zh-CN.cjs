// Build script to generate contextQ-zh-CN.json
// Run: node scripts/build-zh-CN.cjs
const fs = require('fs');
const path = require('path');

const data = { contextQ: {} };

// ===== Family 12: MLCC Capacitors =====
data.contextQ["12"] = {
  voltage_ratio: {
    text: "工作电压相对于额定电压的比例是多少？",
    opt: {
      low: {
        label: "< 额定值的50%",
        desc: "DC偏压降额影响较小，但对II类电介质仍然相关"
      },
      medium: {
        label: "额定值的50-80%",
        desc: "DC偏压降额是重要考虑因素——两个相同的MLCC可能损失30-60%的电容量"
      },
      high: {
        label: "> 额定值的80%",
        desc: "严重的DC偏压降额——在此比例下仅C0G/NP0电介质是安全的"
      }
    }
  },
  flex_pcb: {
    text: "该元件是否安装在柔性或刚柔结合PCB上？",
    opt: {
      yes: {
        label: "是——柔性或刚柔结合",
        desc: "标准MLCC在板弯曲时会开裂，导致短路和潜在火灾风险"
      },
      no: {
        label: "否——刚性PCB",
        desc: "不需要柔性端子，但如果有柔性端子也可以接受"
      }
    }
  },
  audio_path: {
    text: "该元件是否在音频或模拟信号通路中？",
    opt: {
      yes: {
        label: "是——音频/模拟",
        desc: "II类电介质（X7R、X5R）具有压电效应，会产生可听噪声"
      },
      no: {
        label: "否",
        desc: "压电噪声不是问题"
      }
    }
  },
  environment: {
    text: "应用环境是什么？",
    opt: {
      automotive: {
        label: "汽车",
        desc: "AEC-Q200认证成为强制要求"
      },
      industrial: {
        label: "工业/恶劣环境",
        desc: "宽温度范围，可能存在硫化腐蚀"
      },
      consumer: {
        label: "消费电子",
        desc: "标准规格即可满足"
      }
    }
  }
};

// ===== Family 13: Mica Capacitors =====
data.contextQ["13"] = {
  environment: {
    text: "应用环境是什么？",
    opt: {
      automotive: {
        label: "汽车",
        desc: "AEC-Q200认证成为强制要求"
      },
      military: {
        label: "军工/航空航天",
        desc: "MIL规格合规成为强制要求"
      },
      standard: {
        label: "标准/消费电子",
        desc: "无需额外环境标志"
      }
    }
  }
};

// ===== Family 52: Chip Resistors =====
data.contextQ["52"] = {
  precision: {
    text: "这是精密或仪器仪表应用吗？",
    opt: {
      yes: {
        label: "是——精密/仪器仪表",
        desc: "TCR和容差阈值将收紧；可能需要薄膜材质"
      },
      no: {
        label: "否——通用型",
        desc: "标准参数匹配即可满足"
      }
    }
  },
  environment: {
    text: "应用环境是什么？",
    opt: {
      automotive: {
        label: "汽车",
        desc: "AEC-Q200认证成为强制要求"
      },
      industrial_sulfur: {
        label: "工业环境（有硫化腐蚀风险）",
        desc: "抗硫化端子成为强制要求"
      },
      standard: {
        label: "标准/消费电子",
        desc: "无需额外环境标志"
      }
    }
  }
};

// ===== Family 53: Through-Hole Resistors (empty) =====
data.contextQ["53"] = {};

// ===== Family 54: Current Sense Resistors =====
data.contextQ["54"] = {
  kelvin_required: {
    text: "设计是否使用开尔文（四端子）检测？",
    opt: {
      yes: {
        label: "是——四端子开尔文连接",
        desc: "需要独立的激励/检测焊盘以消除引线电阻"
      },
      no: {
        label: "否——标准二端子",
        desc: "标准封装匹配即可满足"
      }
    }
  },
  measurement_precision: {
    text: "需要什么测量精度？",
    opt: {
      high: {
        label: "高精度（<1%）",
        desc: "严格的容差、低TCR和低寄生电感至关重要"
      },
      standard: {
        label: "标准（1-5%）",
        desc: "标准容差和TCR即可满足"
      },
      rough: {
        label: "粗略（>5%）",
        desc: "容差和TCR不是关键——具有较大余量的过流检测"
      }
    }
  },
  sensing_frequency: {
    text: "开关频率是多少？",
    opt: {
      dc_low: {
        label: "DC或低频（<10 kHz）",
        desc: "寄生电感不是问题"
      },
      high_frequency: {
        label: "高频（>100 kHz）",
        desc: "寄生电感变得至关重要——优选金属片型或反向几何结构"
      },
      unknown: {
        label: "未知",
        desc: "标记寄生电感以待审查"
      }
    }
  }
};

// ===== Family 55: Chassis Mount Resistors =====
data.contextQ["55"] = {
  thermal_management: {
    text: "电阻器如何进行散热管理？",
    opt: {
      dedicated_heatsink: {
        label: "专用散热器，已知热阻",
        desc: "热阻和接口尺寸对功率处理至关重要"
      },
      chassis_mounted: {
        label: "底盘安装（机箱壁、金属框架）",
        desc: "底盘散热路径与专用散热器特性不同"
      },
      free_standing: {
        label: "无散热器/独立安装",
        desc: "功率额定值必须相对安装额定值大幅降额"
      }
    }
  },
  forced_airflow: {
    text: "是否有强制气流？",
    opt: {
      yes: {
        label: "是——风扇冷却",
        desc: "功率额定值可使用风冷降额曲线"
      },
      no: {
        label: "否——自然对流",
        desc: "功率额定值必须使用自然对流降额——更加保守"
      }
    }
  },
  precision: {
    text: "这是精密或仪器仪表应用吗？",
    opt: {
      yes: {
        label: "是——精密/仪器仪表",
        desc: "TCR和容差阈值将收紧；可能需要薄膜材质"
      },
      no: {
        label: "否——通用型",
        desc: "标准参数匹配即可满足"
      }
    }
  },
  environment: {
    text: "应用环境是什么？",
    opt: {
      automotive: {
        label: "汽车",
        desc: "AEC-Q200认证成为强制要求"
      },
      industrial_sulfur: {
        label: "工业环境（有硫化腐蚀风险）",
        desc: "抗硫化端子成为强制要求"
      },
      standard: {
        label: "标准",
        desc: "无需额外环境标志"
      }
    }
  }
};

// ===== Family 58: Aluminum Electrolytic =====
data.contextQ["58"] = {
  ripple_frequency: {
    text: "开关/纹波频率是多少？",
    opt: {
      "120hz": {
        label: "120Hz（市电整流）",
        desc: "直接使用数据手册的纹波电流值"
      },
      high_frequency: {
        label: "高频（开关电源）",
        desc: "纹波电流在更高频率下增加（100kHz时为120Hz的1.4-1.7倍）"
      },
      unknown: {
        label: "未知",
        desc: "将使用120Hz基准，如果用于开关变换器则标记审查"
      }
    }
  },
  ambient_temp: {
    text: "实际环境温度是多少？",
    opt: {
      unknown: {
        label: "未知",
        desc: "无法优化寿命——将使用额定寿命作为硬性阈值"
      }
    }
  },
  polarization: {
    text: "这是有极性还是无极性应用？",
    opt: {
      polarized: {
        label: "有极性（DC，极性恒定）",
        desc: "标准有极电解电容即可"
      },
      non_polarized: {
        label: "无极性/双极性（AC耦合）",
        desc: "需要双极性/无极性电解电容——反向电压会导致气体产生和泄漏"
      }
    }
  }
};

// ===== Family 59: Tantalum Capacitors =====
data.contextQ["59"] = {
  safety_critical: {
    text: "安全关键失效模式是否是一个考虑因素？",
    opt: {
      yes: {
        label: "是——不能容忍短路/燃烧",
        desc: "MnO2类型必须被标记或排除；聚合物类型以良性方式失效（开路）"
      },
      no: {
        label: "否——存在足够的电路保护",
        desc: "MnO2和聚合物类型均可接受，但失效模式仍将被标记"
      }
    }
  },
  voltage_derating: {
    text: "工作电压占额定电压的百分比是多少？",
    opt: {
      "50_percent": {
        label: "遵循50%降额规则",
        desc: "行业最佳实践——在额定值≤50%下工作可显著降低故障率"
      },
      above_50: {
        label: "工作在额定值的50%以上",
        desc: "MnO2类型高风险——标记所有候选器件"
      },
      unknown: {
        label: "未知",
        desc: "假设最坏情况——标记审查"
      }
    }
  },
  inrush_protection: {
    text: "电路是否有浪涌/冲击电流保护？",
    opt: {
      yes: {
        label: "是——串联电阻或软启动",
        desc: "浪涌电流已受控——ESR和电压标准匹配"
      },
      no: {
        label: "否——硬上电直接进入电容",
        desc: "浪涌电流未受控——MnO2类型特别容易受损"
      }
    }
  }
};

// ===== Family 60: Aluminum Polymer =====
data.contextQ["60"] = {
  ripple_frequency: {
    text: "开关/纹波频率是多少？",
    opt: {
      "120hz": {
        label: "120 Hz（市电整流）",
        desc: "120 Hz下的数据手册纹波电流额定值直接适用"
      },
      high_freq: {
        label: "特定高频（>10 kHz）",
        desc: "纹波电流额定值随频率变化——需验证降额"
      },
      unknown: {
        label: "未知",
        desc: "必须验证实际频率下的纹波电流额定值"
      }
    }
  },
  esr_primary: {
    text: "ESR是否为主要选择标准？",
    opt: {
      yes: {
        label: "是——选择聚合物就是因为ESR",
        desc: "ESR匹配成为强制要求——这是选择聚合物而非标准电解的主要原因"
      },
      no: {
        label: "否——标准选型",
        desc: "标准ESR匹配即可满足"
      }
    }
  },
  environment: {
    text: "应用环境是什么？",
    opt: {
      automotive: {
        label: "汽车",
        desc: "AEC-Q200认证成为强制要求"
      },
      standard: {
        label: "标准/消费电子",
        desc: "无需额外环境标志"
      }
    }
  }
};

// ===== Family 61: Supercapacitors =====
data.contextQ["61"] = {
  function: {
    text: "该超级电容器的主要功能是什么？",
    opt: {
      backup: {
        label: "能量备份/保持",
        desc: "RTC、SRAM、掉电保持——漏电流和自放电是主要指标"
      },
      pulse: {
        label: "脉冲功率缓冲",
        desc: "GSM突发、电机启动、再生制动——ESR和峰值电流是主要指标"
      },
      harvesting: {
        label: "能量采集缓冲",
        desc: "漏电流必须低于采集器输出——自放电决定能量积累"
      }
    }
  },
  cold_start: {
    text: "该应用是否需要冷启动/低温工作？",
    opt: {
      yes: {
        label: "是——汽车、户外",
        desc: "低温ESR在-40°C时可能增加5-10倍——必须验证降额曲线"
      },
      no: {
        label: "否——室内/受控环境",
        desc: "标准ESR规格即可满足"
      }
    }
  }
};

fs.writeFileSync(
  path.join(__dirname, 'contextQ-zh-CN-part1.json'),
  JSON.stringify(data, null, 2),
  'utf8'
);
console.log('Part 1 written (families 12-61)');
