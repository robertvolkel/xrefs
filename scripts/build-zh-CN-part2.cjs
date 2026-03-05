// Part 2: families 64-72
const fs = require('fs');
const path = require('path');

const part2 = {};

// ===== Family 64: Film Capacitors =====
part2["64"] = {
  application_type: {
    text: "电路应用类型是什么？",
    opt: {
      emi: {
        label: "AC市电滤波/EMI抑制",
        desc: "安全等级（X/Y类）成为强制要求；AC电压额定值为主要指标"
      },
      dc_filtering: {
        label: "DC滤波/耦合/旁路",
        desc: "DC电压额定值为主要指标；不需要安全等级"
      },
      snubber: {
        label: "缓冲/脉冲放电",
        desc: "dV/dt和峰值脉冲电流为主要指标——优选薄膜/箔片结构"
      },
      motor_run: {
        label: "电机运行/功率因数校正",
        desc: "AC电压额定值和纹波电流为主要指标；必须额定用于连续AC"
      },
      precision: {
        label: "精密定时/谐振电路",
        desc: "损耗因数、温度系数和容差成为主要指标"
      }
    }
  },
  safety_class: {
    text: "需要什么安全等级？",
    opt: {
      x1: { label: "X1（线间，最高级别）" },
      x2: { label: "X2（线间，标准级别）" },
      y1: { label: "Y1（线对地，最高级别）" },
      y2: { label: "Y2（线对地，标准级别）" }
    }
  },
  dvdt_requirement: {
    text: "电路的dV/dt要求是什么？",
    opt: {
      unknown: {
        label: "未知",
        desc: "所有候选器件将被标记进行dV/dt审查——未经验证不要替换"
      }
    }
  }
};

// ===== Family 65: Varistors / MOVs =====
part2["65"] = {
  application_type: {
    text: "该压敏电阻是否用于汽车应用？",
    opt: {
      mains: {
        label: "AC市电浪涌保护（雷击、开关浪涌）",
        desc: "安全等级和热断路器成为强制要求；能量和浪涌电流为主要指标"
      },
      dc_automotive: {
        label: "DC总线/汽车保护（负载突卸、感性尖峰）",
        desc: "不需要安全等级；最大DC电压和响应时间为主要指标"
      },
      esd: {
        label: "ESD/信号线保护",
        desc: "低电容和快速响应时间对信号完整性至关重要"
      }
    }
  },
  thermal_disconnect: {
    text: "原器件是否有热断路器/熔断器？",
    opt: {
      yes: {
        label: "是——有热断路器",
        desc: "替换器件必须也有热断路器——防止热失控和火灾"
      },
      no: {
        label: "否——裸MOV",
        desc: "不需要热断路器但可作为升级；验证电路是否有外部过流保护"
      },
      unknown: {
        label: "未知——需要检查",
        desc: "必须在继续之前检查原器件或电路设计"
      }
    }
  },
  environment: {
    text: "该器件是否用于汽车应用？",
    opt: {
      automotive: {
        label: "是——汽车",
        desc: "AEC-Q200强制要求；工作温度必须覆盖汽车范围；浪涌额定值需符合ISO 7637"
      },
      no: {
        label: "否——标准/工业",
        desc: "标准环境匹配"
      }
    }
  }
};

// ===== Family 66: PTC Resettable Fuses =====
part2["66"] = {
  circuit_voltage: {
    text: "电路最大电压是多少？",
    opt: {
      low: {
        label: "低电压（≤6V）",
        desc: "初始电阻压降显著——验证Ihold × R₁是否可接受"
      },
      medium: {
        label: "中等电压（6-60V）",
        desc: "应验证标准Vmax余量"
      },
      high: {
        label: "高电压（>60V）",
        desc: "Vmax是最关键参数——额定值以上有电弧风险"
      }
    }
  },
  ambient_temperature: {
    text: "环境工作温度是多少？",
    opt: {
      specific_temp: {
        label: "高温（>40°C）",
        desc: "保持电流和触发电流必须降额——PTC自恢复保险丝对温度敏感"
      },
      room_temp: {
        label: "室温（~25°C）",
        desc: "数据手册额定值直接适用——无需降额"
      },
      unknown: {
        label: "未知",
        desc: "必须确定环境温度后才能最终选型"
      }
    }
  },
  fault_frequency: {
    text: "保险丝是否会频繁触发/复位？",
    opt: {
      frequent: {
        label: "频繁（正常工作的一部分）",
        desc: "耐久循环次数、电阻蠕变和初始电阻是关键考虑因素"
      },
      rare: {
        label: "偶尔（仅紧急保护）",
        desc: "标准耐久额定值即可满足"
      }
    }
  }
};

// ===== Family 67: NTC Thermistors =====
part2["67"] = {
  function: {
    text: "R-T曲线是否已编码到固件中？",
    opt: {
      sensing: {
        label: "NTC——温度检测",
        desc: "R25、B值、容差和R-T曲线精度为主要指标"
      },
      inrush: {
        label: "NTC——浪涌电流限制",
        desc: "冷态电阻、最大电流、最大功率和热恢复为主要指标"
      },
      compensation: {
        label: "NTC——温度补偿",
        desc: "R25和B值必须与补偿目标精确匹配；漂移很重要"
      }
    }
  },
  accuracy: {
    text: "需要什么温度精度？",
    opt: {
      standard: {
        label: "标准（±1-2°C）",
        desc: "R25容差≤5%，B值容差≤3%——B值匹配即可满足"
      },
      precision: {
        label: "精密（±0.5°C或更好）",
        desc: "R25容差≤1%，B值容差≤1%——需要Steinhart-Hart验证"
      }
    }
  },
  firmware_rt: {
    text: "R-T曲线是否已编码到固件中？",
    opt: {
      yes: {
        label: "是——代码中的查找表或Steinhart-Hart",
        desc: "替换器件必须符合相同的R-T曲线，否则必须更新固件"
      },
      no: {
        label: "否——模拟电路（分压器+比较器）",
        desc: "B值匹配即可满足——极端条件下的曲线形状不太重要"
      }
    }
  }
};

// ===== Family 68: PTC Thermistors =====
part2["68"] = {
  function: {
    text: "该PTC热敏电阻的用途是什么？",
    opt: {
      overcurrent: {
        label: "过流保护（自恢复保险丝）",
        desc: "居里/开关温度、保持电流、触发电流和最大电压为主要指标"
      },
      heater: {
        label: "自调节加热器",
        desc: "居里温度（平衡温度）、功率额定值和外形尺寸为主要指标"
      }
    }
  }
};

// ===== Family 69: Common Mode Chokes =====
part2["69"] = {
  application_type: {
    text: "该器件是否连接到市电？",
    opt: {
      signal: {
        label: "信号线",
        desc: "USB、HDMI、以太网、CAN、LVDS、MIPI——频率处的阻抗为主要指标"
      },
      power: {
        label: "电源线",
        desc: "AC市电滤波器、DC总线滤波器——电感量和额定电流为主要指标"
      }
    }
  },
  interface_standard: {
    text: "使用哪种接口标准？",
    opt: {
      usb2: {
        label: "USB 2.0",
        desc: "90Ω ±15%阻抗——漏感和模式转换很重要"
      },
      usb3: {
        label: "USB 3.x / USB4",
        desc: "超高速——模式转换（Scd21）是最主要的关注点"
      },
      ethernet: {
        label: "100/1000BASE-T以太网",
        desc: "按IEEE 802.3的特定插入损耗和回波损耗规格"
      },
      can: {
        label: "CAN / CAN-FD",
        desc: "较低速度，对漏感容忍度更高"
      }
    }
  },
  mains_connected: {
    text: "该器件是否连接到市电？",
    opt: {
      yes: {
        label: "是——AC市电（120V/240V）",
        desc: "安全等级成为强制要求；电压必须覆盖市电和瞬态"
      },
      no: {
        label: "否——DC总线或低压电源",
        desc: "不需要安全等级；电压和电流额定值仍为主要指标"
      }
    }
  }
};

// ===== Family 70: Ferrite Beads =====
part2["70"] = {
  signal_or_power: {
    text: "该铁氧体磁珠是在电源轨还是信号线上？",
    opt: {
      power: {
        label: "电源轨",
        desc: "对DC电源轨进行滤波（例如3.3V、5V、12V）"
      },
      signal: {
        label: "信号线",
        desc: "对数据或时钟信号进行滤波（例如I2C、SPI、时钟）"
      }
    }
  },
  operating_current: {
    text: "实际DC工作电流（峰值）是多少？",
    opt: {
      unknown: {
        label: "未知/变化",
        desc: "将标记所有候选器件进行DC偏压降额审查"
      }
    }
  },
  signal_frequency: {
    text: "信号频率是多少？",
    opt: {
      broadband: {
        label: "宽带/未知",
        desc: "将标记进行全频段阻抗曲线审查"
      }
    }
  }
};

// ===== Family 71: Power Inductors =====
part2["71"] = {
  circuit_type: {
    text: "该电感用在什么类型的变换器/电路中？",
    opt: {
      switcher: {
        label: "降压/升压/升降压开关变换器",
        desc: "Isat和Irms均至关重要；磁芯材料的饱和特性很重要"
      },
      linear: {
        label: "LDO输出/通用滤波",
        desc: "Irms为主要指标（热性能）；Isat不太关键——无开关引起的电流尖峰"
      },
      emi: {
        label: "EMI滤波器/共模",
        desc: "可能使用了错误的元件类型——考虑共模扼流圈或铁氧体磁珠"
      }
    }
  },
  operating_current: {
    text: "实际工作DC电流是多少？",
    opt: {
      unknown: {
        label: "未知",
        desc: "将标记进行Isat降额审查"
      }
    }
  },
  shielding_required: {
    text: "是否需要EMI屏蔽？",
    opt: {
      yes: {
        label: "是——需要屏蔽电感",
        desc: "非屏蔽型不能替换屏蔽型"
      },
      no: {
        label: "否/不确定",
        desc: "屏蔽型始终可以替换非屏蔽型（升级）"
      }
    }
  }
};

// ===== Family 72: RF/Signal Inductors =====
part2["72"] = {
  frequency_band: {
    text: "工作频率是多少？",
    opt: {
      low_rf: {
        label: "低射频（100 kHz – 30 MHz）",
        desc: "铁氧体磁芯仍可使用；SRF必须远高于工作频率"
      },
      high_rf: {
        label: "高射频/微波（>30 MHz）",
        desc: "仅限空气/陶瓷磁芯；Q值是最主要的规格"
      },
      broadband: {
        label: "宽带",
        desc: "SRF和宽频带内平坦的阻抗是主要关注点"
      },
      unknown: {
        label: "未知",
        desc: "标记SRF和Q值以待审查"
      }
    }
  },
  q_requirement: {
    text: "需要什么Q值？",
    opt: {
      high_q: {
        label: "高Q（>50）",
        desc: "需要空气/陶瓷磁芯，严格容差；屏蔽可能降低Q值"
      },
      moderate_q: {
        label: "中等Q（20-50）",
        desc: "标准Q值匹配——在工作频率下验证"
      },
      low_q: {
        label: "低Q/不关心",
        desc: "Q值不是主要选择标准"
      }
    }
  },
  shielding_required: {
    text: "是否需要EMI屏蔽？",
    opt: {
      yes: {
        label: "是——需要屏蔽",
        desc: "需要屏蔽电感；验证对Q值的影响"
      },
      no: {
        label: "否/不关心",
        desc: "非屏蔽型可能具有更高Q值；屏蔽型始终可以替换非屏蔽型（升级）"
      }
    }
  }
};

module.exports = part2;
// Write to temp file
const fs2 = require('fs');
fs2.writeFileSync(
  path.join(__dirname, 'contextQ-zh-CN-part2.json'),
  JSON.stringify(part2, null, 2),
  'utf8'
);
console.log('Part 2 written (families 64-72)');
