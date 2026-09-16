// 킹오더브라더스 장비견적서 템플릿 데이터 (장비견적서.xlsx 시트 기준 자동 생성)
const QUOTE_TEMPLATES = [
  {
    "id": "tpl1",
    "title": "삼포트 POS SET",
    "subtitle": "킹오더 POS 세트",
    "image": "assets/quote/tpl_sampos_front.png",
    "totalText": "설치비 미포함 / TOTAL PRICE  : 현금가  900,000 원 or 할부렌탈가 월 33,000 원 (부가세 별도가) /",
    "specRows": [
      {
        "label": "Display",
        "value": "15 inch (1024*768)"
      },
      {
        "label": "CPU",
        "value": "Intel Celeron J6412 / (Quad Core upTO 2.6GHz)"
      },
      {
        "label": "Memory/Storage",
        "value": "DDR4 2 Slot : 4GB(up to 32GB)"
      },
      {
        "label": "OS",
        "value": "Windows 10 loT 2021"
      },
      {
        "label": "I/O",
        "value": "USB 6, Serial 4 (D-Sub9 3, RJ45 1), LAN 1, / Drawer 1, Video 2 (DP 1, HDMI 1)"
      },
      {
        "label": "Touch",
        "value": "PCAP Touch"
      },
      {
        "label": "Power",
        "value": "AC 100-240V, 50~60Hz / DC 12V, 5A (60W)"
      },
      {
        "label": "Dimensions(mm) / (WzDzH)",
        "value": "15 inch : 355 x215 x 432mm"
      },
      {
        "label": "Weight (kg)",
        "value": "5.35kg"
      },
      {
        "label": "Color",
        "value": "Gold & Black / Silver & White"
      }
    ],
    "lines": [
      {
        "name": "본품 (킹오더 POS 세트)",
        "qty": 1,
        "price": 900000,
        "note": "POS / POS 프린터 / 금전함 / 키보드 / 마우스 / 포함가"
      },
      {
        "name": "듀얼모니터 9.7인치",
        "qty": 1,
        "price": 200000,
        "note": "선택사항"
      },
      {
        "name": "듀얼모니터 15인치",
        "qty": 1,
        "price": 300000,
        "note": "선택사항"
      },
      {
        "name": "설치비(포스단독 설치시)",
        "qty": 1,
        "price": 100000,
        "note": "필수선택사항"
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(장비2대까지 / 추가시 장비 +대당 월5,000원)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_sampos_kob.png",
      "assets/quote/tpl_sampos_sam.png",
      "assets/quote/tpl_sampos_front.png",
      "assets/quote/tpl_sampos_side.png"
    ]
  },
  {
    "id": "tpl2",
    "title": "킹오더브라더스 POS SET",
    "subtitle": "킹오더 POS 세트",
    "image": "assets/quote/tpl_kob_pos_main.png",
    "totalText": "/ TOTAL PRICE  : 현금가  850,000 원 or 할부렌탈가 월 30,000 원 (부가세 별도가) /",
    "specRows": [
      {
        "label": "중앙처리장치(CPU)",
        "value": "Intel Celeron Quad-Core Jasper Lake(N5095,4M Cache, 2.90 GHz"
      },
      {
        "label": "메모리",
        "value": "DDR4 4GB(최대16GB)"
      },
      {
        "label": "저장장치",
        "value": "2.5, SATA-III SSD 128GB↑, Dual M.2 2280 SSD"
      },
      {
        "label": "화면",
        "value": "15\", 1024x768, 24Bit, Luminance:300cd/㎡, Backlight:LED"
      },
      {
        "label": "터치스크린",
        "value": "15\", Projective Capacitive Touch(Bezelless)"
      },
      {
        "label": "HDMI",
        "value": "1EA(Intel HD Graphics)"
      },
      {
        "label": "LAN",
        "value": "1EA(Realt다 Gigabit LAN)"
      },
      {
        "label": "시리얼(Serial)",
        "value": "5EA(DSUB-9Px2EA/RJ-45x3EA)"
      },
      {
        "label": "USB",
        "value": "USB3.0x4EA(I/O), USB2.0x2EA(Rear)"
      },
      {
        "label": "오디오",
        "value": "1EA(Line-Out)"
      },
      {
        "label": "스피커",
        "value": "1EA(1W)"
      },
      {
        "label": "쿨러 및 팬",
        "value": "Fanless(무소음)"
      },
      {
        "label": "금전함 포트",
        "value": "1EA(RJ-11, 24V/12V)"
      },
      {
        "label": "전원",
        "value": "60[W]Adaptor, Input AC100-240V/50-60Hz, DC24V/2.5A"
      },
      {
        "label": "제품크기(mm)",
        "value": "384(W)x347(H)x225(D) (With Stand, With SCR)"
      },
      {
        "label": "제품무게(kg)",
        "value": "4.8kg"
      }
    ],
    "lines": [
      {
        "name": "본품 (킹오더 POS 세트)",
        "qty": 1,
        "price": 850000,
        "note": "POS / 프린터 / 멀티패드 / 돈통 / 듀얼모니터 / 포함가"
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다.",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kob_pos_main.png",
      "assets/quote/tpl_kob_pos.png",
      "assets/quote/tpl_kob_printer.png",
      "assets/quote/tpl_kob_drawer.png"
    ]
  },
  {
    "id": "tpl3",
    "title": "킹오더 21.5인치 키오스크(안드로이드)",
    "subtitle": "21.5인치 킹오더 키오스크 탁상형",
    "image": "assets/quote/tpl_kiosk_and215.png",
    "totalText": "설치비 포함 / TOTAL PRICE  : 현금가  1,200,000 원 or 할부렌탈가 월 45,000 원  (부가세별도가) /",
    "specRows": [
      {
        "label": "Model",
        "value": "WST25 V1.0"
      },
      {
        "label": "Size",
        "value": "170mm*97mm"
      },
      {
        "label": "CPU",
        "value": "Rockchip RK3568 ARM Cortex-A55 Uitra strong quad core with a main frequency of up to 2.0GHz"
      },
      {
        "label": "Operate system",
        "value": "Android 11"
      },
      {
        "label": "DDR",
        "value": "4GB(ddr4)extend"
      },
      {
        "label": "EMMC",
        "value": "16GB ( 32/64GB optional, maximum support128G)"
      },
      {
        "label": "HDMI output",
        "value": "Supports HDMI 2.1 4kx2k@60Hz output"
      },
      {
        "label": "Audio and video output",
        "value": "Supports left and right dual channel output, Built in dual 4 Ω/5W power amplifiers"
      },
      {
        "label": "TF card",
        "value": "Maximum support 128G"
      },
      {
        "label": "ports",
        "value": "1 analog MIC inout"
      },
      {
        "label": "",
        "value": "1 USB OTG, 12 USB HOST"
      },
      {
        "label": "",
        "value": "5debug Uarts (3 232, 2TTL 1 485)"
      },
      {
        "label": "",
        "value": "2I²C touch screen ports"
      },
      {
        "label": "",
        "value": "4 I/O port"
      },
      {
        "label": "",
        "value": "2 12V DC (DC and 4PIN_2.0 spacing socket)"
      },
      {
        "label": "",
        "value": "1 RTC pocer port"
      },
      {
        "label": "",
        "value": "Gigabit adaptive Ethernet port"
      },
      {
        "label": "",
        "value": "1 reserve audio port"
      },
      {
        "label": "",
        "value": "2 Independent control of vacklight interface"
      },
      {
        "label": "",
        "value": "1 integrated port (1 power on/off button, 2ADC buttons/LED/IR_IN interface)"
      }
    ],
    "lines": [
      {
        "name": "본품 (21.5인치 킹오더 키오스크 탁상형)",
        "qty": 1,
        "price": 1200000,
        "note": "부가세별도가"
      },
      {
        "name": "키오스크 스탠드",
        "qty": 1,
        "price": 200000,
        "note": "선택사항"
      },
      {
        "name": "설치비",
        "qty": 1,
        "price": 200000,
        "note": "필수선택사항"
      },
      {
        "name": "화물운송비",
        "qty": 1,
        "price": 0,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(장비2대까지 / 추가시 장비 +대당 월5,000원)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kiosk_and215_stand.png",
      "assets/quote/tpl_kiosk_and215.png"
    ]
  },
  {
    "id": "tpl4",
    "title": "킹오더 27인치 키오스크(안드로이드)",
    "subtitle": "27인치 킹오더 키오스크 탁상형",
    "image": "assets/quote/tpl_kiosk_and215.png",
    "totalText": "설치비 미포함 / TOTAL PRICE  : 현금가 1,800,000 원 or 할부렌탈가 월 70,000 원  (부가세별도가) /",
    "specRows": [
      {
        "label": "CPU",
        "value": "RK3568"
      },
      {
        "label": "Memory",
        "value": "DDR4 8GB"
      },
      {
        "label": "Storage",
        "value": "16 GB"
      },
      {
        "label": "Display",
        "value": "27\" Full HD 1920 X 1080 dot, 250cd/m2"
      },
      {
        "label": "Touch",
        "value": "Capacirive Touch Panel, 10point touch"
      },
      {
        "label": "HDMI",
        "value": "1ea"
      },
      {
        "label": "LAN",
        "value": "1000M Ethernet"
      },
      {
        "label": "WIFI, BT",
        "value": "2.4G Single, BT 4.2"
      },
      {
        "label": "Seria / USB",
        "value": "COM 3 port / USB 4 port"
      },
      {
        "label": "Printer",
        "value": "3 inch THERMAL 200MM/sec(폭 80.0mm, 지름 80파이)"
      },
      {
        "label": "운영체제(OS)",
        "value": "Android 12"
      },
      {
        "label": "색상 / 무게",
        "value": "954mm(H) * 430mm(W) * 68.8mm ( D(받침대 포함시 205mm) / 22KG"
      },
      {
        "label": "QR Scanner",
        "value": "1D / 2D 겸용 인식 / QR Code Scan mode ; sense mode"
      },
      {
        "label": "카드단말기(옵션)",
        "value": "IC/MSR(여신 금융법 인증 단말기, 옵션사항)"
      }
    ],
    "lines": [
      {
        "name": "본품 (27인치 킹오더 키오스크 탁상형)",
        "qty": 1,
        "price": 1800000,
        "note": "부가세별도가"
      },
      {
        "name": "키오스크 스탠드",
        "qty": 1,
        "price": 200000,
        "note": "선택사항"
      },
      {
        "name": "설치비",
        "qty": 1,
        "price": 200000,
        "note": "필수선택사항"
      },
      {
        "name": "화물운송비",
        "qty": 1,
        "price": 0,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(장비2대까지 / 추가시 장비 +대당 월5,000원)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kiosk_and215.png",
      "assets/quote/tpl_kiosk_and215_stand.png"
    ]
  },
  {
    "id": "tpl5",
    "title": "킹오더 21.5인치 키오스크(윈도우)",
    "subtitle": "21.5인치 윈도우 키오스크 카드전용",
    "image": "assets/quote/tpl_kiosk_and215_stand.png",
    "totalText": "설치비 미포함 / TOTAL PRICE  : 현금가  1,300,000원 or 월 55,000원  (부가세별도가) /",
    "specRows": [
      {
        "label": "CPU",
        "value": "Intel-l5 3세대"
      },
      {
        "label": "Memory",
        "value": "DDR4 8GB(RAM)"
      },
      {
        "label": "Storage",
        "value": "M.2 2280(SATA) 128GB"
      },
      {
        "label": "Display",
        "value": "21.5\" Full HD 1920 x 1080 dot, 250cd/m2"
      },
      {
        "label": "Touch",
        "value": "Capacitive touch panel, 10 point touch"
      },
      {
        "label": "HDMI",
        "value": "1ea"
      },
      {
        "label": "LAN",
        "value": "Realtek RTL8111 10/100/1000M Ethemet"
      },
      {
        "label": "Seria / USB",
        "value": "COM 3port / USB 4port"
      },
      {
        "label": "Printer",
        "value": "3 luch Themal 200mm/Sec(폭 80.0mm, 지름80파이)"
      },
      {
        "label": "운영체제 (OS)",
        "value": "Windows 10 Pro 탑재"
      },
      {
        "label": "색상 / 무게",
        "value": "805(H) x 340(W) x205(D)mm / 20Kg"
      },
      {
        "label": "QR Scanner",
        "value": "1D / 2D 겸용인식/ QR code Scan mode : sense mode"
      },
      {
        "label": "카드단말기(옵션사항)",
        "value": "IC/MSR(여신 금융업법 인증 단말기, 옵션 사항)"
      }
    ],
    "lines": [
      {
        "name": "본품 (21.5인치 윈도우 키오스크 카드전용)",
        "qty": 1,
        "price": 1300000,
        "note": "부가세 별도가"
      },
      {
        "name": "키오스크 스탠드",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "설치비",
        "qty": 1,
        "price": 200000,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(장비2대까지 / 추가시 장비 +대당 월5,000원)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kiosk_and215_stand.png",
      "assets/quote/tpl_kiosk_win215_a.png",
      "assets/quote/tpl_kiosk_win215_b.png"
    ]
  },
  {
    "id": "tpl6",
    "title": "킹오더 21인치 키오스크(윈도우)",
    "subtitle": "21인치 윈도우 키오스크",
    "image": "assets/quote/tpl_kiosk_win21_stand.png",
    "totalText": "",
    "specRows": [
      {
        "label": "CPU",
        "value": "Intel-l5 3세대"
      },
      {
        "label": "Memory",
        "value": "DDR4 8GB(RAM)"
      },
      {
        "label": "Storage",
        "value": "M.2 2280(SATA) 128GB"
      },
      {
        "label": "Display",
        "value": "21.5\" Full HD 1920 x 1080 dot, 250cd/m2"
      },
      {
        "label": "Touch",
        "value": "Capacitive touch panel, 10 point touch"
      },
      {
        "label": "HDMI",
        "value": "1ea"
      },
      {
        "label": "LAN",
        "value": "Realtek RTL8111 10/100/1000M Ethemet"
      },
      {
        "label": "Seria / USB",
        "value": "COM 3port / USB 4port"
      },
      {
        "label": "Printer",
        "value": "3 luch Themal 200mm/Sec(폭 80.0mm, 지름80파이)"
      },
      {
        "label": "운영체제 (OS)",
        "value": "Windows 10 Pro 탑재"
      },
      {
        "label": "색상 / 무게",
        "value": "805(H) x 340(W) x205(D)mm / 20Kg"
      },
      {
        "label": "QR Scanner",
        "value": "1D / 2D 겸용인식/ QR code Scan mode : sense mode"
      },
      {
        "label": "카드단말기(옵션사항)",
        "value": "IC/MSR(여신 금융업법 인증 단말기, 옵션 사항)"
      }
    ],
    "lines": [
      {
        "name": "본품 (21인치 윈도우 키오스크)",
        "qty": 1,
        "price": 1400000,
        "note": ""
      },
      {
        "name": "키오스크 스탠드",
        "qty": 1,
        "price": 200000,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kiosk_win21_stand.png",
      "assets/quote/tpl_kiosk_win21_body.png"
    ]
  },
  {
    "id": "tpl7",
    "title": "킹오더 27인치 키오스크(윈도우) (3)",
    "subtitle": "",
    "image": "assets/quote/tpl_set_dualpos.png",
    "totalText": "",
    "specRows": [],
    "lines": [
      {
        "name": "듀얼 POS SET",
        "qty": 1,
        "price": 1050000,
        "note": "9.7\" 듀얼모니터 포함"
      },
      {
        "name": "21.5인치 스탠드 키오스크",
        "qty": 1,
        "price": 1800000,
        "note": "윈도우"
      },
      {
        "name": "43인치 DID SET",
        "qty": 1,
        "price": 1200000,
        "note": "모니터 + 셋탑PC + 솔루션"
      },
      {
        "name": "QR오더",
        "qty": 1,
        "price": 0,
        "note": "무상제공"
      },
      {
        "name": "설치비",
        "qty": 1,
        "price": 300000,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(VAT별도)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_set_dualpos.png",
      "assets/quote/tpl_set_kiosk215.png",
      "assets/quote/tpl_set_did.png",
      "assets/quote/tpl_set_qr.png"
    ]
  },
  {
    "id": "tpl8",
    "title": "킹오더 27인치 키오스크(윈도우) (2)",
    "subtitle": "",
    "image": "assets/quote/tpl_set_dualpos.png",
    "totalText": "",
    "specRows": [],
    "lines": [
      {
        "name": "듀얼 POS SET",
        "qty": 1,
        "price": 850000,
        "note": "9.7\" 듀얼모니터 포함"
      },
      {
        "name": "A22CSA 키오스크",
        "qty": 1,
        "price": 1350000,
        "note": "미리내 프로그램 사용"
      },
      {
        "name": "DID SET",
        "qty": 1,
        "price": 800000,
        "note": "모니터 + 셋탑PC + 솔루션"
      },
      {
        "name": "22\" KDS SET",
        "qty": 1,
        "price": 600000,
        "note": "(H/W ,S/W)"
      },
      {
        "name": "POS + KIOSK 설치비",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "DID(벽걸이형) 설치비",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "배송비(키오스크)",
        "qty": 1,
        "price": 150000,
        "note": ""
      },
      {
        "name": "배송비(DID)",
        "qty": 1,
        "price": 15000,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 30,000원(VAT별도) / 키오스크 2대 사용시 월 35,000원",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_set_dualpos.png",
      "assets/quote/tpl_set_kiosk_a22.png",
      "assets/quote/tpl_set_did.png",
      "assets/quote/tpl_set_kds.png"
    ]
  },
  {
    "id": "tpl9",
    "title": "킹오더 현금겸용 키오스크(윈도우)",
    "subtitle": "21.5인치 윈도우 키오스크 카드전용",
    "image": "assets/quote/tpl_kiosk_cash.png",
    "totalText": "설치비 미포함 / TOTAL PRICE  : 현금가                 원 or 월           원  (부가세별도가) /",
    "specRows": [
      {
        "label": "CPU",
        "value": "Inter-J6412"
      },
      {
        "label": "Memory",
        "value": "DDR4 8GB(RAM)"
      },
      {
        "label": "Storage",
        "value": "M.2 2280(SATA) 128GB"
      },
      {
        "label": "Display",
        "value": "21.5\" Full HD 1920 x 1080 dot, 250cd/m2"
      },
      {
        "label": "Touch",
        "value": "Capacitive touch panel, 10 point touch"
      },
      {
        "label": "HDMI",
        "value": "1ea"
      },
      {
        "label": "LAN",
        "value": "Realtek RTL8111 10/100/1000M Ethemet"
      },
      {
        "label": "Seria / USB",
        "value": "COM 3port / USB 4port"
      },
      {
        "label": "Printer",
        "value": "3 luch Themal 200mm/Sec(폭 80.0mm, 지름80파이)"
      },
      {
        "label": "운영체제 (OS)",
        "value": "Windows 10 Pro 탑재"
      },
      {
        "label": "색상 / 무게",
        "value": "527mm(W) * 650mm(H) * 437mm(D) / 46KG"
      },
      {
        "label": "QR Scanner",
        "value": "1D / 2D 겸용인식/ QR code Scan mode : sense mode"
      },
      {
        "label": "카드단말기(옵션사항)",
        "value": "IC/MSR(여신 금융업법 인증 단말기, 옵션 사항)"
      }
    ],
    "lines": [
      {
        "name": "프로그램 비용",
        "qty": 1,
        "price": 0,
        "note": ""
      },
      {
        "name": "키오스크 스탠드",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "설치비",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "화물운송비",
        "qty": 1,
        "price": 0,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(장비2대까지 / 추가시 장비 +대당 월5,000원)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_kiosk_cash.png"
    ]
  },
  {
    "id": "tpl10",
    "title": "킹오더 테이블오더",
    "subtitle": "킹오더 테이블오더",
    "image": "assets/quote/tpl_tableorder.png",
    "totalText": "설치비 미포함 / TOTAL PRICE  : 현금가          원 or 렌탈가 월       원  (부가세별도가) /",
    "specRows": [
      {
        "label": "CPU",
        "value": "Arm Coetex-A73(Media Tech 고사양 칩셋) Octa-core /"
      },
      {
        "label": "RAM",
        "value": "4GB /"
      },
      {
        "label": "ROM",
        "value": "32GB"
      },
      {
        "label": "Screen Size",
        "value": "10.1 inch BOE IPS /"
      },
      {
        "label": "Touch Screen",
        "value": "HD IPD 1200 x 800 dots 해상도 with CTP(G+G) /"
      },
      {
        "label": "Cover Case",
        "value": "Plastic cover case 사출 방식 /"
      },
      {
        "label": "PORT",
        "value": "C-Type 2 port (충전, 통신 port 역할) /"
      },
      {
        "label": "Camera",
        "value": "Front 2MP / Rear 5MP /"
      },
      {
        "label": "Battery",
        "value": "내장형 around 6,000mAh /"
      },
      {
        "label": "Speaker",
        "value": "1W x 2ea /"
      },
      {
        "label": "운영체제 (OS)",
        "value": "Android 12 /"
      },
      {
        "label": "Wifi",
        "value": "2.4G b.g.n   5G n.ac /"
      },
      {
        "label": "색상",
        "value": "Gray /"
      },
      {
        "label": "제품크기",
        "value": "240 x 160 x 7mm /"
      }
    ],
    "lines": [
      {
        "name": "설치비",
        "qty": 1,
        "price": 0,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원(10대까지, 10대 이후로 테이블오더 대당 월 1,000원 추가)",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_tableorder.png"
    ]
  },
  {
    "id": "tpl11",
    "title": "킹오더_DID 세트",
    "subtitle": "43인치 DID 세트",
    "image": "assets/quote/tpl_did_menu.png",
    "totalText": "",
    "specRows": [
      {
        "label": "PC",
        "value": "/ CPU: RK3368 Cortex-A53 Octa-Core 64-bit 1.5GHZ / Memeory : DDR3 2GB / Storage : 16GB / Interface : USB *2/DC12V/HDMI/LAN/SD /"
      },
      {
        "label": "Monitor",
        "value": "43인치 삼성 LH43QETELGCXKR / 해상도: 4K UHD (3840x2160 / 60Hz) / 직하형 백라이트 DIRECT LED / 10bit 컬러 디스플레이어 / 178도 광시야각 패널 (여러각도에서 시청시 색번짐방지) / 명암비 : 4000:1 / 응답속도 8ms / VESA 200*200"
      },
      {
        "label": "프로그램",
        "value": "메뉴판  / 고객호출 / 광고 (서버형)"
      },
      {
        "label": "Weight",
        "value": "MAX 8.4Kg"
      },
      {
        "label": "Size",
        "value": "963.9(H) x 558.9(W) x 59.6(D) mm"
      },
      {
        "label": "Set 구성품",
        "value": "안드로이드 셋탑 / WEB 기반 클라우드서버"
      },
      {
        "label": "OS",
        "value": "Android"
      }
    ],
    "lines": [
      {
        "name": "셋탑PC",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "솔루션",
        "qty": 1,
        "price": 300000,
        "note": ""
      },
      {
        "name": "삼성 43인치 모니터",
        "qty": 1,
        "price": 550000,
        "note": ""
      },
      {
        "name": "벽걸이 설치(브라켓 포함)",
        "qty": 1,
        "price": 200000,
        "note": ""
      },
      {
        "name": "천장형 설치(브라켓 포함)",
        "qty": 1,
        "price": 350000,
        "note": ""
      },
      {
        "name": "KDS 테블릿 (1대당)",
        "qty": 1,
        "price": 250000,
        "note": ""
      },
      {
        "name": "KDS 솔루션 (1대당)",
        "qty": 1,
        "price": 100000,
        "note": ""
      }
    ],
    "remarks": [
      "제품 발주시 100% 현금 선입금 방식으로 진행 되며, 상기 금액은 부가세 별도 입니다.",
      "제품 Warrenty : 설치 후 1년",
      "유지보수비용 :  월 10,000원",
      "Network 공사비 별도",
      "배송 / 설치비용은 (도서산간 및 제주지역을 제외한) 전국을 진행하며, 도서산간 지역 및 제주지역은 별도의 운송 비용이 발생합니다."
    ],
    "images": [
      "assets/quote/tpl_did_menu.png",
      "assets/quote/tpl_did_store3.png",
      "assets/quote/tpl_did_store_green.png"
    ]
  }
];
