// Part 3: families B1-B9
const fs = require('fs');
const path = require('path');

const part3 = {};

// ===== B1: Rectifier Diodes =====
part3["B1"] = {
  switching_frequency: {
    text: "该电路的开关频率是多少？",
    opt: {
      mains_50_60hz: {
        label: "50/60Hz（市电整流）",
        desc: "trr无关紧要——即使5µs的标准二极管相对于16-20ms的周期也可忽略不计。Vf占主导。"
      },
      low_freq_1k_50k: {
        label: "1kHz-50kHz（电机驱动、低频开关）",
        desc: "trr开始变得重要。快恢复是最低要求。软/硬恢复特性开始重要。"
      },
      smps_50k_500k: {
        label: "50kHz-500kHz（SMPS、DC-DC变换器）",
        desc: "trr和Qrr成为主要指标——开关损耗占主导。通常需要超快恢复型。"
      },
      above_500k: {
        label: ">500kHz",
        desc: "考虑肖特基二极管或SiC二极管。在此频率下硅整流器可能是遗留设计。"
      }
    }
  },
  circuit_topology: {
    text: "该二极管的电路拓扑或功能是什么？",
    opt: {
      power_supply_rectifier: {
        label: "电源整流器（半桥/全桥、中心抽头）",
        desc: "标准整流应用。Io、Ifsm和配置为主要指标。"
      },
      freewheeling_clamp: {
        label: "续流/钳位二极管（电感或继电器线圈）",
        desc: "无论主电路频率如何，快速/超快恢复都很关键。反向电压必须覆盖感性尖峰。"
      },
      oring_redundant: {
        label: "OR连接/冗余电源",
        desc: "各路径之间的Vf匹配至关重要。反向漏电流重要（持续反向偏置）。"
      },
      reverse_polarity: {
        label: "反极性保护",
        desc: "Vf至关重要（永久性压降）。恢复时间无关紧要。"
      }
    }
  },
  low_voltage: {
    text: "这是低压应用吗（电源电压≤12V）？",
    opt: {
      yes: {
        label: "是——电源≤12V",
        desc: "Vf成为最主要的关注点。5V上1.1V的压降意味着22%的损耗。考虑肖特基二极管。"
      },
      no: {
        label: "否——电源>12V",
        desc: "标准Vf匹配。48V或400V上100mV的差异可忽略不计。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。注意：分立器件使用Q101，而非Q200（无源器件）。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B2: Schottky Barrier Diodes =====
part3["B2"] = {
  low_voltage: {
    text: "这是低压应用吗（电源电压≤12V）？",
    opt: {
      yes: {
        label: "是——3.3V、5V或12V供电轨",
        desc: "Vf成为绝对主导规格。每50mV都很重要。3.3V上0.45V的肖特基压降意味着14%的电源损失。"
      },
      no: {
        label: "否——较高电压（>12V）",
        desc: "Vf仍然重要但不占绝对主导。反向漏电流变得更显著（Ir × Vr = 漏电功耗）。"
      }
    }
  },
  ambient_temperature: {
    text: "工作或环境温度是什么？",
    opt: {
      high_ambient: {
        label: "高温环境（>60°C）或散热不佳",
        desc: "反向漏电流升级为关键指标。肖特基Ir每升高10°C翻倍——热失控风险真实存在。"
      },
      room_temp: {
        label: "室温/良好散热",
        desc: "25°C下标准Ir匹配即可满足。热失控风险低。"
      }
    }
  },
  semiconductor_material: {
    text: "这是硅还是碳化硅（SiC）肖特基二极管？",
    opt: {
      silicon: {
        label: "硅（标准）",
        desc: "正常肖特基匹配。电压额定值通常≤200V。Vf是其主要优势。"
      },
      sic: {
        label: "SiC（碳化硅）",
        desc: "不同的产品类别。600-1700V。更高的Vf（1.2-1.7V）但零恢复+高耐压+温度稳定性。"
      },
      unknown: {
        label: "不确定",
        desc: "根据电压判断：Vrrm≥300V几乎可以确定是SiC。低于200V几乎可以确定是硅。"
      }
    }
  },
  parallel_operation: {
    text: "二极管是否并联工作以获得更高电流？",
    opt: {
      yes: {
        label: "是——并联以获得更高电流",
        desc: "Vf温度系数变得关键。正温度系数（大电流）= 安全均流。负温度系数（小电流）= 热失控风险。"
      },
      no: {
        label: "否",
        desc: "Vf温度系数是次要关注点。标准匹配。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。注意：分立器件使用Q101，而非Q200（无源器件）。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B3: Zener Diodes =====
part3["B3"] = {
  zener_function: {
    text: "该稳压二极管的用途是什么？",
    opt: {
      clamping: {
        label: "电压钳位/过压保护",
        desc: "Vz和功耗是仅有的主要规格。容差可以宽松（±5-10%）。TC、Zzt和噪声无关紧要。"
      },
      reference: {
        label: "电压基准/精密偏置",
        desc: "TC成为主要指标——电压稳定性是核心需求。动态阻抗（Zzt）和容差收紧。噪声可能重要。"
      },
      esd_protection: {
        label: "信号线ESD保护",
        desc: "结电容（Cj）成为主要指标——高Cj会降低快速数据线的信号完整性。反向漏电流重要。"
      },
      level_shifting: {
        label: "电压电平转换",
        desc: "实际工作电流下的Vz精度重要。动态阻抗决定电平转换随负载的变化。TC对温度稳定性重要。"
      }
    }
  },
  reference_precision: {
    text: "该基准需要什么电压精度/稳定性？",
    opt: {
      high: {
        label: "高精度（全温度范围内<0.1%稳定性）",
        desc: "TC≤0.01%/°C，容差≤1%，Zzt成为硬性阈值。如果要求非常严格，考虑使用专用IC电压基准（LM4040、TL431）。"
      },
      moderate: {
        label: "中等精度（0.1-1%稳定性）",
        desc: "TC≤0.05%/°C，容差≤2%。标准Zzt匹配。噪声为次要。"
      },
      coarse: {
        label: "粗略基准（>1%稳定性）",
        desc: "标准Vz和容差匹配。TC和Zzt为次要。"
      }
    }
  },
  signal_speed: {
    text: "被保护线路的信号速度是多少？",
    opt: {
      high_speed: {
        label: "高速数字信号（USB 2.0+、HDMI、SPI >10MHz）",
        desc: "Cj成为硬性阈值——必须≤原器件。考虑使用专用ESD保护二极管（TVS阵列）替代。"
      },
      low_speed: {
        label: "低速数字或模拟信号（I2C、UART、GPIO、传感器）",
        desc: "Cj为次要——低速信号可容忍更高的电容。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。注意：分立器件使用Q101，而非Q200（无源器件）。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B4: TVS Diodes =====
part3["B4"] = {
  tvs_application: {
    text: "该TVS二极管的应用场景是什么？",
    opt: {
      power_rail: {
        label: "电源轨保护",
        desc: "Ppk和Ipp为主要指标。钳位电压必须低于被保护电路的最大耐压。"
      },
      signal_line: {
        label: "信号线保护（USB、HDMI、以太网、SPI、I2C）",
        desc: "结电容（Cj）成为主要指标——TVS在正常工作时会加载信号。ESD额定值成为主要功率指标。配置/拓扑重要——导向二极管阵列可实现最低Cj。"
      },
      automotive_bus: {
        label: "汽车总线保护（CAN、LIN、FlexRay）",
        desc: "必须能承受汽车瞬态（ISO 7637负载突卸），同时保持总线速度可接受的电容。AEC-Q101强制要求。钳位电压必须满足总线收发器的最大值。"
      }
    }
  },
  transient_source: {
    text: "该TVS保护的瞬态类型是什么？",
    opt: {
      esd: {
        label: "ESD（IEC 61000-4-2）",
        desc: "ESD额定值为主要功率规格。极短脉冲（纳秒级），低能量（µJ-mJ）。响应时间必须<1ns。"
      },
      power_surge: {
        label: "雷击/电源浪涌（IEC 61000-4-5，8/20µs）",
        desc: "8/20µs波形下的Ppk为主要规格。能量远高于ESD。Cj无关紧要。"
      },
      telecom: {
        label: "电信雷击（GR-1089）",
        desc: "特定电信浪涌标准。极高能量。TVS必须明确额定为GR-1089。"
      },
      automotive_transient: {
        label: "汽车瞬态（ISO 7637负载突卸）",
        desc: "极高能量、长持续时间瞬态。TVS必须额定用于汽车浪涌波形。"
      }
    }
  },
  interface_speed: {
    text: "被保护线路的信号速度是多少？",
    opt: {
      high_speed: {
        label: "高速（USB 3.x、HDMI 2.x、PCIe、>1Gbps）",
        desc: "Cj必须超低（每线<1pF）。优选导向二极管拓扑。即使2-3pF也会导致信号完整性失败（眼图闭合）。"
      },
      medium_speed: {
        label: "中速（USB 2.0、100BASE-T以太网、SPI >10MHz）",
        desc: "Cj应<5pF每线。标准低电容TVS阵列可用。"
      },
      low_speed: {
        label: "低速（I2C、UART、CAN、GPIO、<10MHz）",
        desc: "Cj可达15-50pF。更多TVS选择可用。功率处理能力可以更高。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。必须满足汽车瞬态波形要求。工作温度范围必须覆盖-40°C至+125°C或+150°C。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B5: MOSFETs =====
part3["B5"] = {
  switching_topology: {
    text: "该MOSFET工作在什么开关拓扑中？",
    opt: {
      hard_switching: {
        label: "硬开关PWM（降压、升压、半桥）",
        desc: "栅极电荷和米勒电荷（Qgd）主导开关损耗。最小化Qgd × Rds(on)乘积。Crss决定dV/dt噪声注入。"
      },
      soft_switching: {
        label: "软开关/谐振（ZVS、LLC、CRM）",
        desc: "Coss是谐振回路的一部分——不同的Coss会改变谐振频率和ZVS窗口。Qgd不太关键，因为漏极在导通前已摆至零。"
      },
      linear_mode: {
        label: "线性模式（热插拔、eFuse、电机软启动）",
        desc: "MOSFET长时间工作在完全导通和完全关断之间。SOA曲线是最关键的规格——必须图形化比较。Vgs(th)决定工作点控制。"
      },
      dc_low_frequency: {
        label: "DC/低频（负载开关、ORing、电池保护）",
        desc: "Rds(on)主导总损耗——开关损耗可忽略不计。栅极电荷参数无关紧要。"
      }
    }
  },
  synchronous_rectification: {
    text: "该MOSFET是否用于同步整流？",
    opt: {
      yes_above_50khz: {
        label: "是——开关频率≥50kHz",
        desc: "阻断条件：体二极管trr至关重要。在死区时间内体二极管导通。在≥50kHz时，高trr导致直通——互补开关在体二极管停止导通前就开启，造成瞬间母线短路。需要明确的工程签字确认。"
      },
      yes_below_50khz: {
        label: "是——低于50kHz",
        desc: "体二极管trr重要但在较低频率下不太关键。死区时间损耗与频率成正比。"
      },
      no: {
        label: "否",
        desc: "体二极管性能为次要。默认匹配规则适用。"
      }
    }
  },
  parallel_operation: {
    text: "MOSFET是否并联工作以进行电流分担？",
    opt: {
      yes: {
        label: "是——并联MOSFET",
        desc: "Vgs(th)具有负温度系数——较热的器件先导通、承载更多电流并进一步发热。Rds(on)正温度系数在完全导通状态下提供自平衡，但在转换期间Vgs(th)效应占主导。使用匹配器件并配置独立的栅极电阻。"
      },
      no: {
        label: "否",
        desc: "标准匹配规则适用。"
      }
    }
  },
  drive_voltage: {
    text: "电路提供什么栅极驱动电压？",
    opt: {
      logic_level: {
        label: "逻辑电平（3.3V或5V）",
        desc: "Rds(on)必须在4.5V Vgs下规定（逻辑电平规格）。仅在10V Vgs下规定的MOSFET在4.5V时可能有显著更高的Rds(on)。Vgs(th)最大值必须远低于驱动电压以确保完全饱和。"
      },
      standard: {
        label: "标准（10V或12V）",
        desc: "默认栅极驱动假设。大多数MOSFET数据手册在10V Vgs下规定Rds(on)。"
      },
      high_voltage_sic: {
        label: "高压SiC/GaN（15V-18V，带负关断）",
        desc: "SiC/GaN栅极驱动使用+18V/-5V或+15V/-4V。负关断电压防止Crss耦合引起的误导通。验证Vgs(max)覆盖正负两个方向的偏移。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。雪崩能量对汽车故障条件下的UIS生存至关重要。工作温度范围必须覆盖-40°C至+150°C。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B6: BJTs =====
part3["B6"] = {
  operating_mode: {
    text: "该BJT的工作模式是什么？",
    opt: {
      saturated_switching: {
        label: "饱和开关（数字逻辑驱动器、继电器驱动器、螺线管驱动器、LED驱动器）",
        desc: "存储时间（tst）成为最主要的开关速度关注点。Vce(sat)为主要导通损耗规格。hFE仅需足以在所需Ic下使器件饱和——电路设计者通常以最低hFE的5-10倍过驱动基极。"
      },
      linear_analog: {
        label: "线性/模拟（放大器、缓冲器、线性稳压器、电流镜、传感器接口）",
        desc: "晶体管不会进入饱和状态。实际工作Ic和温度下的hFE成为主要指标。ft决定带宽。高Vce和显著Ic时SOA变得关键。"
      },
      class_ab_pair: {
        label: "AB类/推挽输出级（音频放大器、电机驱动互补对）",
        desc: "开关速度和模拟性能均重要。NPN和PNP之间的hFE匹配对对称行为至关重要。Vbe(on)匹配决定交越失真。静态工作点需要SOA。"
      }
    }
  },
  switching_frequency: {
    text: "开关频率是多少？",
    opt: {
      low_lt_10khz: {
        label: "低频（<10kHz）——继电器驱动器、螺线管驱动器、LED驱动器",
        desc: "存储时间是关注点但在低频下不是关键——即使2µs的tst在1kHz下也可忽略不计。重点关注Vce(sat)和基极驱动是否充足。"
      },
      medium_10k_100k: {
        label: "中频（10kHz-100kHz）——PWM电机控制、电源管理",
        desc: "存储时间成为有意义的约束。tst必须在关断期内完成。反饱和技术（肖特基钳位）变得重要。验证在工作Ic和基极驱动条件下的tst。"
      },
      high_gt_100khz: {
        label: "高频（>100kHz）——高速逻辑驱动器、开关稳压器",
        desc: "存储时间至关重要，可能是约束性指标。如果替换器件数据手册中未指定tst，则为阻断条件。需要专为快速开关设计的高ft晶体管。"
      }
    }
  },
  complementary_pair: {
    text: "这是互补对应用吗（NPN + PNP配对）？",
    opt: {
      yes_complementary: {
        label: "是——NPN和PNP配对（推挽、H桥、互补对称）",
        desc: "NPN和PNP两半必须作为匹配对一起评估。如有可能，用已知的互补对替换（如BC546/BC556、2N3904/2N3906、2SA1943/2SC5200）。"
      },
      no_single_device: {
        label: "否——单管、电流镜或同极性差分对",
        desc: "标准单器件替换规则适用。对于差分对（匹配的NPN-NPN或PNP-PNP），两管之间的hFE匹配对偏置电压偏差很重要。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车（需要AEC-Q101）",
        desc: "AEC-Q101认证成为强制要求。工作温度范围必须至少覆盖-40°C至+125°C。"
      },
      no: {
        label: "否——非汽车",
        desc: "标准环境匹配适用。"
      }
    }
  }
};

// ===== B7: IGBTs =====
part3["B7"] = {
  switching_frequency: {
    text: "IGBT的开关频率是多少？",
    opt: {
      low_lt_20khz: {
        label: "低频（≤20kHz）——电机驱动、UPS、焊机",
        desc: "低开关频率下导通损耗占主导。Vce(sat)是约束性规格——额定电流下每降低0.1V直接节省功率。开关损耗（Eon + Eoff）为次要。大多数工业IGBT应用属于此类。"
      },
      medium_20k_50k: {
        label: "中频（20kHz-50kHz）——高性能伺服、太阳能逆变器",
        desc: "导通损耗和开关损耗相当。Vce(sat)和Eoff均重要。场截止（Field-Stop）技术在此范围内提供最佳折中。"
      },
      high_50k_100k: {
        label: "高频（50kHz-100kHz）——高密度电源、感应加热",
        desc: "开关损耗占主导。Eoff是最关键参数。仅场截止型IGBT可用——PT和NPT无法满足开关速度要求。考虑在这些频率下SiC MOSFET是否是更好的技术选择。"
      },
      above_100khz: {
        label: "100kHz以上——建议审查",
        desc: "IGBT很少用于100kHz以上。由于零拖尾电流和显著更低的开关损耗，SiC MOSFET在这些频率下几乎可以确定是正确的技术选择。如果必须使用IGBT，则仅最快的场截止型可用。"
      }
    }
  },
  switching_topology: {
    text: "这是硬开关还是软开关（谐振）应用？",
    opt: {
      hard_switching: {
        label: "硬开关（PWM逆变器、电机驱动、升降压）",
        desc: "导通和关断均在IGBT承受全总线电压时发生。Eon包含对端二极管反向恢复能量。Eoff包含拖尾电流能量。两者均贡献于总开关损耗。"
      },
      soft_switching: {
        label: "软开关/谐振（串联谐振、LLC、ZVS）",
        desc: "IGBT导通前电压摆至零（ZVS），消除导通损耗。关断仍产生Eoff，因为大多数谐振拓扑中关断时集电极电流不为零。"
      }
    }
  },
  parallel_operation: {
    text: "是否有多个IGBT并联工作进行电流分担？",
    opt: {
      yes: {
        label: "是——并联IGBT",
        desc: "关键：不要混用不同技术的IGBT并联。PT型IGBT具有负Vce(sat)温度系数——较热的器件电压降更大、电流更大、进一步发热导致热失控。FS/NPT型具有正温度系数（自平衡）。PT与FS/NPT混用会导致PT器件吸走电流。并联器件间Vge(th)必须匹配以确保动态均流。"
      },
      no: {
        label: "否——单器件",
        desc: "标准匹配规则适用。技术升级层次（FS > NPT > PT）有效。"
      }
    }
  },
  short_circuit_protection: {
    text: "该应用是否需要短路耐受能力？",
    opt: {
      yes_desat: {
        label: "是——去饱和检测（电机驱动、牵引、伺服）",
        desc: "阻断条件：栅极驱动器使用去饱和检测来感知短路事件（栅极导通时Vce升高超过阈值）。IGBT必须在驱动器检测到故障并启动受控关断的tsc微秒内存活。如果替换器件的tsc短于驱动器响应时间（通常5-10µs），IGBT将在保护动作前失效。"
      },
      no: {
        label: "否——不需要短路耐受",
        desc: "应用不需要短路耐受能力（例如具有固有电流限制的谐振变换器，或外部快速熔断器保护）。标准匹配规则适用。"
      }
    }
  },
  automotive: {
    text: "这是汽车或牵引应用吗？",
    opt: {
      yes: {
        label: "是——汽车/牵引",
        desc: "AEC-Q101成为强制要求。短路耐受时间对牵引逆变器故障保护至关重要。密封外壳中高环境温度下的牵引应用通常需要Tj(max) 175°C。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B8: Thyristors =====
part3["B8"] = {
  device_subtype: {
    text: "这是什么类型的晶闸管器件？",
    opt: {
      scr: {
        label: "SCR（可控硅整流器）",
        desc: "单向器件——仅从阳极到阴极导通，由正栅极脉冲触发。用于DC电机驱动、过压保护、AC半波和全波相位控制。象限工作和无缓冲额定不适用。"
      },
      triac: {
        label: "TRIAC（三端双向可控硅）",
        desc: "双向器件——双方向导通，无需桥式整流即可处理完整AC周期。在AC调光器、加热控制器、AC电机软启动中占主导。tq（关断时间）不适用——TRIAC使用自然AC换向。"
      },
      diac: {
        label: "DIAC（双向触发二极管）",
        desc: "二端子、无栅极——当达到转折电压时对称触发。几乎专用作TRIAC的触发器件。无栅极参数、无象限工作、无tq、无缓冲额定。"
      }
    }
  },
  application_type: {
    text: "该晶闸管的主要应用是什么？",
    opt: {
      ac_phase_control: {
        label: "AC相位控制（调光器、加热器、风扇调速）",
        desc: "标准AC相位控制应用。AC过零点处的自然换向提供充足的反向偏置时间。默认匹配规则适用——dV/dt和无缓冲额定是主要关注点。"
      },
      crowbar_dc: {
        label: "过压保护/DC斩波器（强迫换向）",
        desc: "关键：SCR强迫换向应用。换向电路（电容+辅助SCR）是围绕主SCR的tq专门设计的。更长tq的替换器件会导致换向失败（重新触发、直通、失控）。"
      },
      ac_zero_cross: {
        label: "AC过零开关（固态继电器）",
        desc: "光耦-TRIAC组合用于过零点处的隔离AC开关。保持电流很重要，因为器件必须在整个AC半周期内维持导通，包括过零附近的低电流区域。"
      },
      motor_soft_start: {
        label: "AC电机软启动/浪涌限制",
        desc: "电机启动电流为额定值的6-10倍，持续数秒。浪涌电流（ITSM）和I²t（熔断器配合）均成为主要关注点。"
      }
    }
  },
  snubber_circuit: {
    text: "PCB设计中是否包含跨接于晶闸管的RC缓冲电路？",
    opt: {
      no_snubber: {
        label: "无缓冲——需要无缓冲额定器件",
        desc: "阻断条件：PCB上没有缓冲焊盘。只能使用无缓冲额定的TRIAC（高dV/dt抗扰度，500-1000V/µs）。没有缓冲的标准TRIAC会因线路瞬态而误触发——电路没有防止手段。"
      },
      snubber_present: {
        label: "是——PCB上有RC缓冲",
        desc: "缓冲网络将dV/dt限制在器件额定值内。标准或无缓冲TRIAC均可使用。默认匹配规则适用。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车",
        desc: "AEC-Q101成为强制要求。汽车晶闸管应用包括车身电子、HVAC控制、电池管理开关。温度范围至少-40°C至+125°C——冷启动时IGT的可靠性至关重要。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

// ===== B9: JFETs =====
part3["B9"] = {
  application_domain: {
    text: "该JFET的主要应用领域是什么？",
    opt: {
      audio_low_frequency: {
        label: "音频/低频（前置放大器、麦克风缓冲器、仪器仪表）",
        desc: "1/f噪声转角频率和低频噪声系数是约束性规格。最佳音频JFET（2SK170、IF3602）的fc为10-100Hz。截止频率（ft）和电容（Ciss、Crss）在100kHz以下无关紧要——即使20pF Ciss的转角频率也远高于音频频段。"
      },
      rf_vhf: {
        label: "RF / VHF低噪声放大器（HF、VHF、UHF前端）",
        desc: "截止频率（ft）、输入/输出电容和工作RF频率下的噪声系数是约束性规格。频率接近ft时NF急剧上升。1/f噪声在MHz以上频率无关紧要。Crss决定密勒效应带宽限制。"
      },
      ultra_high_z: {
        label: "超高阻抗输入（pH电极、静电计、电离检测器）",
        desc: "阻断条件：栅极漏电流（Igss）是最约束性的规格。100GΩ源阻抗上10pA产生1V偏移误差。Igss大约每升高10°C翻倍——必须在最高工作温度下验证。应用：pH计（10MΩ-1GΩ）、电离室、质谱仪、驻极体麦克风（1-10GΩ阻抗）。"
      },
      general_purpose: {
        label: "通用型（开关、电流源、压控电阻）",
        desc: "标准匹配权重适用。无特定应用领域驱动参数升级。JFET可用作恒流源、压控电阻或通用模拟开关。"
      }
    }
  },
  matched_pair: {
    text: "该应用是否需要匹配对JFET？",
    opt: {
      yes: {
        label: "是——差分输入或平衡电路",
        desc: "差分输入（仪表放大器）和平衡前置放大器需要匹配对JFET。单器件替换规则不充分——必须在两个器件之间严格匹配Vp和Idss。某些制造商分选更严格的容差等级（A、B、C后缀）。未经工程验证配对匹配性不能自动批准。"
      },
      no: {
        label: "否——单器件",
        desc: "标准单器件匹配规则适用。Vp和Idss的范围重叠即可满足。"
      }
    }
  },
  automotive: {
    text: "这是汽车应用吗？",
    opt: {
      yes: {
        label: "是——汽车（需要AEC-Q101）",
        desc: "AEC-Q101成为强制要求。汽车JFET应用包括轮速传感器接口、压力传感器前端和精密仪器仪表。温度范围：-40°C至+125°C。必须验证125°C下的Igss（从25°C规格每10°C翻倍）、Vp温度稳定性（~+2mV/°C）以及偏置电路鲁棒性的Idss温度特性。"
      },
      no: {
        label: "否",
        desc: "标准环境匹配。"
      }
    }
  }
};

const fs2 = require('fs');
fs2.writeFileSync(
  path.join(__dirname, 'contextQ-zh-CN-part3.json'),
  JSON.stringify(part3, null, 2),
  'utf8'
);
console.log('Part 3 written (families B1-B9)');
