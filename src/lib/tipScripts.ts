/**
 * 살림 정보 쇼츠 **검수본 대본** (2026-10-21 사장님 "유용한 정보들은 이상 없는지 확인").
 *
 * 37개 주제를 무료 Gemini 로 한 번에 뽑아 보니(render-demo tipcheck, run 39540102547) 29개 중 10개 넘게
 * 틀리거나 애매했다 - 예: "헹굼물에 소금을 넣으면 빨리 마른다"(사실 아님), "뽁뽁이는 물기를 닦고 붙인다"(물을 뿌려 붙인다),
 * "창틀 물구멍을 스펀지로 막아라"(빗물이 안 빠져 샌다), "맨 아래칸에 생고기와 채소"(핏물이 채소에 닿는다),
 * "정전기 때문에 마른 수건으로 닦는다"(반대), 상표명(울샴푸)·"깊게 잘 수 있어요"·"두 배로" 같은 과장. 8개는 아예 못 만들었다.
 * → AI 가 매번 새로 쓰는 방식을 접고, Claude 가 사실을 확인해 다시 쓴 이 대본만 쓴다. 고칠 때는 이 파일을 직접 고친다.
 *
 * 쓰는 원칙: 집에서 바로 따라 할 수 있는 행동 + 눈에 보이는 이유(물기·공기·온도·무게). 약품·효능·숫자 과장·상품 권유 없음.
 * 확실하지 않은 요령(신문지 습기 흡수 같은 속설)은 넣지 않았다. scripts/tips-selftest.ts 가 37개 전부 안전 검사를 돌린다.
 */
export type ReviewedTip = {
  topic: string;
  hook: string;
  steps: { title: string; detail: string }[];
  outro: string;
  stockQueries: string[];
};

export const TIP_SCRIPTS: ReviewedTip[] = [
  {
    topic: "수건 냄새 안 나게 빠는 순서",
    hook: "수건 꿉꿉한 냄새, 빨래 순서로 줄여요",
    steps: [
      { title: "펼쳐 말린 뒤 모으기", detail: "젖은 채 쌓아 두면 그때부터 냄새가 배요" },
      { title: "섬유유연제는 빼기", detail: "유연제가 남으면 물을 덜 빨아들이고 냄새가 배요" },
      { title: "다 돌면 바로 널기", detail: "세탁기 안에 오래 두면 꿉꿉한 냄새가 생겨요" },
    ],
    outro: "수건은 말려서 모으고, 바로 널어요",
    stockQueries: ["folding towels laundry", "hanging towels to dry", "washing machine laundry"],
  },
  {
    topic: "니트 줄어들지 않게 세탁하는 법",
    hook: "아끼는 니트, 빨고 나면 줄어 있나요?",
    steps: [
      { title: "미지근한 물에 손세탁", detail: "뜨거운 물에 비비면 털이 엉겨 줄어들어요" },
      { title: "비틀어 짜지 않기", detail: "수건으로 감싸 꾹 눌러서 물기를 빼요" },
      { title: "눕혀서 말리기", detail: "옷걸이에 걸면 물 무게 때문에 늘어나요" },
    ],
    outro: "빨기 전에 세탁 라벨부터 확인해요",
    stockQueries: ["hand washing sweater", "knit sweater laundry", "folding knitted sweater"],
  },
  {
    topic: "흰 옷 누렇게 변하지 않게 보관하는 법",
    hook: "넣어 둔 흰 옷, 꺼내 보니 누렇게 됐나요?",
    steps: [
      { title: "깨끗이 빨아서 넣기", detail: "남은 땀과 피지가 시간이 지나며 누렇게 변해요" },
      { title: "세탁소 비닐 벗기기", detail: "비닐이 습기를 가둬 얼룩과 냄새가 생겨요" },
      { title: "빛이 안 드는 곳에", detail: "햇빛을 오래 받으면 흰 옷도 누렇게 바래요" },
    ],
    outro: "빨고, 비닐 벗기고, 어두운 곳에 둬요",
    stockQueries: ["white shirts closet", "hanging white clothes", "organizing wardrobe"],
  },
  {
    topic: "빨래 빨리 마르게 너는 요령",
    hook: "실내 빨래, 하루 지나도 덜 말랐나요?",
    steps: [
      { title: "긴 옷 짧은 옷 번갈아", detail: "길이를 섞어 널면 아래로 바람길이 생겨요" },
      { title: "주먹 하나만큼 띄우기", detail: "붙여 널면 맞닿은 곳에 물기가 오래 남아요" },
      { title: "선풍기 바람 보내기", detail: "공기가 움직여야 물기가 빨리 날아가요" },
    ],
    outro: "바람길만 만들어도 빨래가 빨리 말라요",
    stockQueries: ["hanging clothes to dry", "laundry drying rack indoors", "clothes drying fan"],
  },
  {
    topic: "운동화 모양 안 망가지게 말리는 법",
    hook: "빤 운동화, 마르고 나면 모양이 틀어지죠",
    steps: [
      { title: "물기 먼저 빼기", detail: "수건으로 감싸 꾹꾹 눌러 물기를 빼요" },
      { title: "종이 구겨 넣기", detail: "안을 채우면 모양이 잡히고 물기도 빠져요" },
      { title: "그늘에서 말리기", detail: "햇볕과 드라이기 열은 접착 부분을 상하게 해요" },
    ],
    outro: "젖은 종이는 중간에 한 번 바꿔 줘요",
    stockQueries: ["washing sneakers", "drying shoes", "white sneakers cleaning"],
  },
  {
    topic: "이불 빨래 주기와 말리는 요령",
    hook: "이불 빨래, 얼마나 자주 해야 할까요?",
    steps: [
      { title: "커버는 자주 빨기", detail: "몸에 닿는 커버는 땀이 배기 쉬워 자주 빨아요" },
      { title: "솜은 라벨부터 보기", detail: "물세탁이 안 되는 솜도 있어 라벨대로 해요" },
      { title: "중간에 뒤집어 말리기", detail: "두꺼운 이불은 뒤집어 줘야 속까지 말라요" },
    ],
    outro: "덜 마른 이불은 넣지 말고 더 말려요",
    stockQueries: ["washing blanket laundry", "hanging bedding outside", "making bed with duvet"],
  },
  {
    topic: "냉장고 칸별로 넣으면 좋은 음식",
    hook: "냉장고, 칸마다 넣을 음식이 따로 있어요",
    steps: [
      { title: "위칸엔 바로 먹을 반찬", detail: "눈높이에 두면 잊지 않고 먼저 먹어요" },
      { title: "맨 아래칸엔 생고기", detail: "핏물이 흘러도 다른 음식에 떨어지지 않아요" },
      { title: "문쪽엔 소스와 음료", detail: "자주 열려 온도가 바뀌니 달걀·우유는 피해요" },
    ],
    outro: "채소는 채소칸에 따로 넣어요",
    stockQueries: ["organizing refrigerator shelves", "putting food in fridge", "fridge door bottles"],
  },
  {
    topic: "채소 오래 싱싱하게 보관하는 법",
    hook: "사 온 채소, 며칠 만에 시들어 버리죠",
    steps: [
      { title: "물기 닦고 넣기", detail: "겉에 남은 물기가 닿은 곳부터 물러져요" },
      { title: "잎채소는 종이로 감싸기", detail: "키친타월이 물기를 잡아 덜 시들어요" },
      { title: "길쭉한 채소는 세우기", detail: "대파처럼 긴 채소는 세워 두면 덜 휘어요" },
    ],
    outro: "채소 씻기는 먹기 직전에 해요",
    stockQueries: ["fresh vegetables kitchen", "wrapping lettuce paper towel", "storing vegetables fridge"],
  },
  {
    topic: "남은 밥 맛있게 얼리고 데우는 법",
    hook: "냉동밥, 데우면 딱딱하고 푸석하죠?",
    steps: [
      { title: "따뜻할 때 나눠 담기", detail: "김이 날 때 한 끼씩 담아야 수분이 남아요" },
      { title: "납작하게 펴서 얼리기", detail: "얇게 펴면 빨리 얼고 데울 때 고르게 풀려요" },
      { title: "물 조금 뿌려 데우기", detail: "물을 살짝 뿌리고 덮어 데우면 촉촉해요" },
    ],
    outro: "얼린 날짜를 적어 두고 먼저 먹어요",
    stockQueries: ["cooked rice bowl", "food storage containers freezer", "microwave heating food"],
  },
  {
    topic: "도마 냄새 줄이는 관리 순서",
    hook: "도마에 밴 냄새, 씻어도 남아 있죠?",
    steps: [
      { title: "쓰고 바로 씻기", detail: "음식물과 물기가 남으면 냄새가 배요" },
      { title: "굵은소금으로 문지르기", detail: "칼자국 틈 찌꺼기가 소금에 긁혀 나와요" },
      { title: "세워서 바짝 말리기", detail: "눕혀 두면 바닥 쪽에 물기가 남아요" },
    ],
    outro: "고기용과 채소용 도마를 나눠 써요",
    stockQueries: ["washing cutting board", "wooden cutting board kitchen", "chopping vegetables board"],
  },
  {
    topic: "프라이팬 코팅 오래 쓰는 습관",
    hook: "코팅 팬, 금방 눌어붙기 시작하죠?",
    steps: [
      { title: "빈 팬 센 불 피하기", detail: "빈 팬을 세게 달구면 코팅이 빨리 상해요" },
      { title: "나무·실리콘 뒤집개", detail: "금속 도구는 코팅에 긁힌 자국을 남겨요" },
      { title: "식힌 뒤에 씻기", detail: "뜨거울 때 찬물을 부으면 팬이 상해요" },
    ],
    outro: "씻을 땐 부드러운 스펀지로 닦아요",
    stockQueries: ["cooking with frying pan", "wooden spatula cooking", "washing pan sink"],
  },
  {
    topic: "싱크대 배수구 냄새 줄이는 습관",
    hook: "싱크대에서 올라오는 냄새, 습관이 원인이에요",
    steps: [
      { title: "거름망 매일 비우기", detail: "찌꺼기가 쌓여 상하면서 냄새가 올라와요" },
      { title: "기름은 닦고 씻기", detail: "기름이 배관에 굳으면 냄새와 막힘이 생겨요" },
      { title: "안 쓸 땐 뚜껑 닫기", detail: "배수구에서 냄새가 올라오는 길을 막아요" },
    ],
    outro: "거름망만 매일 비워도 냄새가 줄어요",
    stockQueries: ["kitchen sink washing dishes", "cleaning kitchen sink", "wiping greasy pan paper"],
  },
  {
    topic: "옷장 정리할 때 접는 순서",
    hook: "옷장 정리, 금방 다시 엉망이 되죠?",
    steps: [
      { title: "무거운 옷은 아래칸", detail: "니트·청바지는 아래에 둬야 덜 무너져요" },
      { title: "같은 폭으로 접기", detail: "서랍 폭에 맞춰 접으면 빈틈이 줄어요" },
      { title: "티셔츠는 세워 넣기", detail: "세우면 한눈에 보이고 꺼낼 때 안 흐트러져요" },
    ],
    outro: "오늘은 서랍 한 칸만 해 봐요",
    stockQueries: ["folding clothes neatly", "organizing closet drawers", "folded t-shirts drawer"],
  },
  {
    topic: "현관 신발장 좁을 때 정리 요령",
    hook: "현관에 신발이 늘 나와 있나요?",
    steps: [
      { title: "안 신는 신발 빼기", detail: "철 지난 신발은 상자에 넣어 따로 둬요" },
      { title: "앞뒤 엇갈려 놓기", detail: "한 짝을 반대로 놓으면 폭이 줄어 더 들어가요" },
      { title: "자주 신는 건 아래칸", detail: "손이 바로 가야 현관에 덜 꺼내 둬요" },
    ],
    outro: "현관엔 한 사람당 한 켤레만 둬요",
    stockQueries: ["shoe cabinet organizing", "shoes entryway", "shoe rack home"],
  },
  {
    topic: "서랍 속 자잘한 물건 정리법",
    hook: "서랍 열 때마다 물건 찾느라 뒤지나요?",
    steps: [
      { title: "전부 꺼내서 나누기", detail: "쓸 것과 버릴 것을 먼저 나눠야 덜 쌓여요" },
      { title: "빈 상자로 칸 만들기", detail: "칸을 나누면 작은 물건이 뒤엉키지 않아요" },
      { title: "자주 쓰는 건 앞쪽", detail: "열자마자 보이는 곳에 둬야 안 뒤져요" },
    ],
    outro: "한 칸에는 한 종류만 넣어요",
    stockQueries: ["organizing drawer", "messy drawer organizing", "desk drawer items"],
  },
  {
    topic: "작은 욕실 수납 늘리는 요령",
    hook: "좁은 욕실, 둘 데가 없어 늘 어수선하죠?",
    steps: [
      { title: "쓰는 것만 꺼내 두기", detail: "여분은 밖에 두고 쓰는 것만 욕실에 둬요" },
      { title: "바닥에 두지 않기", detail: "걸어 두면 바닥 물기가 덜 고이고 넓어 보여요" },
      { title: "문 뒤와 벽 쓰기", detail: "빈 벽에 걸면 바닥을 안 쓰고 자리가 생겨요" },
    ],
    outro: "욕실엔 매일 쓰는 것만 남겨요",
    stockQueries: ["small bathroom interior", "bathroom towels shelf", "clean bathroom sink"],
  },
  {
    topic: "계절 옷 바꿀 때 보관 순서",
    hook: "꺼낸 옷에 얼룩이 생겨 있던 적 있죠?",
    steps: [
      { title: "빨아서 넣기", detail: "한 번 입은 옷도 땀이 남아 얼룩이 생겨요" },
      { title: "완전히 말리기", detail: "덜 마른 채 넣으면 꿉꿉한 냄새가 배요" },
      { title: "무거운 옷은 아래로", detail: "두꺼운 옷을 밑에 둬야 위 옷이 덜 눌려요" },
    ],
    outro: "빨고, 말리고, 무거운 건 아래로",
    stockQueries: ["folding winter clothes", "storage boxes clothes", "organizing wardrobe closet"],
  },
  {
    topic: "냉동실 꽉 찼을 때 정리법",
    hook: "냉동실 꽉 차서 문이 잘 안 닫히나요?",
    steps: [
      { title: "종이 상자 벗기기", detail: "포장 상자를 빼면 그만큼 자리가 생겨요" },
      { title: "납작하게 세워 담기", detail: "봉지에 펴 담아 책처럼 세우면 틈이 줄어요" },
      { title: "이름과 날짜 적기", detail: "적어 두면 안쪽에서 묵히는 일이 줄어요" },
    ],
    outro: "오래된 것부터 앞으로 꺼내 먹어요",
    stockQueries: ["organizing freezer", "freezer food bags", "open freezer food"],
  },
  {
    topic: "청소 순서 위에서 아래로 하는 이유",
    hook: "청소했는데 또 먼지가 보이는 이유가 있어요",
    steps: [
      { title: "높은 곳부터 털기", detail: "선반과 조명 위 먼지는 아래로 떨어져요" },
      { title: "가구 위 닦기", detail: "떨어진 먼지까지 책상·식탁에서 닦아 내요" },
      { title: "바닥은 맨 마지막", detail: "다 내려온 먼지를 한 번에 치울 수 있어요" },
    ],
    outro: "위에서 아래로 하면 두 번 안 해요",
    stockQueries: ["dusting high shelf", "wiping table cleaning", "vacuuming floor home"],
  },
  {
    topic: "창틀 먼지 쉽게 닦는 순서",
    hook: "창틀 먼지, 물부터 묻히면 더 번져요",
    steps: [
      { title: "마른 먼지 먼저 쓸기", detail: "물부터 묻히면 먼지가 진흙처럼 뭉쳐요" },
      { title: "젓가락에 물티슈 감기", detail: "좁은 홈과 모서리까지 손이 닿아요" },
      { title: "마른 천으로 마무리", detail: "물기가 남으면 먼지가 다시 달라붙어요" },
    ],
    outro: "마른 먼지, 젖은 닦기, 마른 마무리",
    stockQueries: ["cleaning window frame", "dusty window sill", "wiping window cloth"],
  },
  {
    topic: "욕실 물때 덜 생기게 하는 습관",
    hook: "욕실 물때, 청소보다 습관이 먼저예요",
    steps: [
      { title: "샤워 후 물기 밀기", detail: "벽과 바닥 물기를 밀어 두면 물때가 덜 껴요" },
      { title: "문 열어 환기하기", detail: "습기가 빨리 빠져야 물때가 덜 생겨요" },
      { title: "수전은 마른 천으로", detail: "물방울이 마르면서 하얀 자국이 남아요" },
    ],
    outro: "샤워 끝에 물기만 밀어 두세요",
    stockQueries: ["clean bathroom shower", "wiping bathroom faucet", "bathroom tiles water"],
  },
  {
    topic: "매트리스 관리하는 습관",
    hook: "매트리스, 한쪽만 꺼져 있지 않나요?",
    steps: [
      { title: "아침엔 이불 걷어 두기", detail: "밤새 밴 습기가 빠져나갈 틈이 생겨요" },
      { title: "커버는 자주 빨기", detail: "커버를 빨아야 매트리스에 땀이 덜 배요" },
      { title: "가끔 위아래 돌리기", detail: "눌리는 자리가 바뀌어 한쪽만 덜 꺼져요" },
    ],
    outro: "돌리기 전에 라벨부터 확인해요",
    stockQueries: ["making bed morning", "bedroom mattress", "changing bed sheets"],
  },
  {
    topic: "먼지 덜 쌓이게 하는 집안 습관",
    hook: "닦아도 또 쌓이는 먼지, 습관 차이예요",
    steps: [
      { title: "젖은 천으로 닦기", detail: "마른 천은 먼지를 날리고 젖은 천은 붙잡아요" },
      { title: "겉옷은 현관에서 털기", detail: "밖 먼지를 들이지 않아 실내에 덜 쌓여요" },
      { title: "바닥에 물건 줄이기", detail: "바닥이 비어야 먼지가 구석에 덜 모여요" },
    ],
    outro: "오늘은 젖은 천으로 한 번 닦아 봐요",
    stockQueries: ["wiping dust furniture", "entryway coat hanging", "clean living room floor"],
  },
  {
    topic: "자취방 이사 전 체크리스트",
    hook: "자취방 계약 전, 이것만은 꼭 봐요",
    steps: [
      { title: "물 세기와 물 빠짐", detail: "물을 틀어 수압과 배수를 직접 봐요" },
      { title: "창틀·벽 모서리 얼룩", detail: "검은 얼룩이 있으면 습기가 차는 집이에요" },
      { title: "흠집은 사진 남기기", detail: "입주 전 찍어 두면 나갈 때 덜 다퉈요" },
    ],
    outro: "낮과 밤 두 번 가 보면 더 좋아요",
    stockQueries: ["empty apartment room", "checking bathroom faucet", "taking photo apartment"],
  },
  {
    topic: "원룸 좁아 보이지 않게 배치하는 요령",
    hook: "원룸이 답답해 보이면 가구 높이부터 봐요",
    steps: [
      { title: "큰 가구는 낮게", detail: "높은 가구가 줄면 시선이 트여 넓어 보여요" },
      { title: "입구에서 먼 쪽에 큰 것", detail: "문 앞이 비어야 들어설 때 덜 답답해요" },
      { title: "바닥을 드러내기", detail: "바닥이 많이 보일수록 방이 넓어 보여요" },
    ],
    outro: "가구 하나만 옮겨도 느낌이 달라요",
    stockQueries: ["small studio apartment", "minimalist bedroom interior", "cozy small room"],
  },
  {
    topic: "혼자 살 때 장보기 줄이는 요령",
    hook: "냉장고 채소, 매번 버리고 있나요?",
    steps: [
      { title: "먹을 메뉴 먼저 정하기", detail: "메뉴를 정하고 사야 남는 재료가 줄어요" },
      { title: "한 끼씩 나눠 얼리기", detail: "고기·대파는 소분해 얼리면 덜 버려요" },
      { title: "냉장고 사진 찍어 가기", detail: "있는 재료를 또 사는 실수를 막아요" },
    ],
    outro: "장보기 전 냉장고부터 열어 봐요",
    stockQueries: ["writing grocery list", "grocery shopping basket", "open refrigerator food"],
  },
  {
    topic: "자취방 전기요금 아끼는 습관",
    hook: "자취방 전기요금, 습관으로 줄일 수 있어요",
    steps: [
      { title: "안 쓰는 플러그 뽑기", detail: "꽂아만 둬도 대기전력이 조금씩 나가요" },
      { title: "냉장고 문 빨리 닫기", detail: "냉기가 빠진 만큼 냉장고가 더 돌아가요" },
      { title: "난방기기는 타이머로", detail: "잠든 뒤 꺼지게 하면 켜 둔 시간이 줄어요" },
    ],
    outro: "오늘 밤 플러그 하나부터 뽑아 봐요",
    stockQueries: ["unplugging power cord", "closing refrigerator door", "turning off lights"],
  },
  {
    topic: "캠핑 첫날 짐 싸는 순서",
    hook: "캠핑 짐, 아무렇게나 싸면 찾느라 헤매요",
    steps: [
      { title: "무거운 짐은 아래로", detail: "텐트와 타프를 밑에 둬야 짐이 안 흔들려요" },
      { title: "먼저 쓸 건 위에", detail: "랜턴과 장갑은 도착하자마자 꺼내 써요" },
      { title: "틈은 옷으로 채우기", detail: "빈 곳을 채우면 이동 중에 짐이 덜 쏠려요" },
    ],
    outro: "쓰는 순서 반대로 넣으면 돼요",
    stockQueries: ["packing camping gear", "camping car trunk", "camping equipment"],
  },
  {
    topic: "타프 바람에 덜 흔들리게 치는 요령",
    hook: "캠핑 가서 타프가 바람에 흔들릴 때",
    steps: [
      { title: "낮은 쪽을 바람 쪽으로", detail: "바람을 받는 면이 낮아야 덜 펄럭여요" },
      { title: "줄은 팽팽하게", detail: "느슨한 줄은 바람에 타프를 더 흔들어요" },
      { title: "팩은 비스듬히 깊게", detail: "줄 반대쪽으로 기울여 박아야 안 빠져요" },
    ],
    outro: "바람이 아주 세면 타프는 걷어요",
    stockQueries: ["camping tarp setup", "tent stakes ground", "camping ropes tent"],
  },
  {
    topic: "캠핑 밤에 덜 춥게 자는 요령",
    hook: "캠핑장에서 자다 추워서 깬 적 있죠?",
    steps: [
      { title: "바닥 매트 한 겹 더", detail: "찬 기운은 바닥에서 올라와 매트가 중요해요" },
      { title: "침낭 빈 곳 채우기", detail: "남는 공간을 옷으로 채우면 온기가 덜 빠져요" },
      { title: "따뜻한 물통 넣기", detail: "새지 않는 통을 수건에 감싸 발밑에 둬요" },
    ],
    outro: "자기 전 젖은 양말은 꼭 갈아 신어요",
    stockQueries: ["camping tent night", "sleeping bag camping", "camping sleeping mat"],
  },
  {
    topic: "차박 처음 할 때 챙길 것",
    hook: "처음 차박이라면 이것부터 챙겨요",
    steps: [
      { title: "시동 끄고 자기", detail: "시동을 켠 채 자면 배기가스가 들어올 수 있어요" },
      { title: "창문 조금 열어 두기", detail: "환기가 돼야 습기와 답답함이 덜해요" },
      { title: "바닥 평평하게 맞추기", detail: "매트로 높낮이를 맞춰야 몸이 덜 배겨요" },
    ],
    outro: "창문 가리개와 랜턴도 챙겨요",
    stockQueries: ["car camping night", "car camping mattress", "camping lantern car"],
  },
  {
    topic: "장마철 옷장 습기 잡는 요령",
    hook: "장마철 옷장, 꿉꿉한 냄새가 나나요?",
    steps: [
      { title: "옷 사이 간격 두기", detail: "빽빽하면 공기가 안 통해 습기가 머물러요" },
      { title: "맑은 날 문 열어 두기", detail: "옷장 안 습기를 밖으로 내보내요" },
      { title: "다 마른 옷만 넣기", detail: "덜 마른 옷 하나가 옷장 전체를 눅눅하게 해요" },
    ],
    outro: "옷장도 가끔 숨 쉬게 열어 줘요",
    stockQueries: ["organizing closet clothes", "rainy day window", "hanging clothes wardrobe"],
  },
  {
    topic: "여름 음식물 쓰레기 냄새 줄이는 요령",
    hook: "여름 음식물 쓰레기 냄새, 물기가 문제예요",
    steps: [
      { title: "물기 꼭 짜서 버리기", detail: "물기가 적을수록 덜 상하고 냄새가 덜 나요" },
      { title: "뚜껑 닫아 두기", detail: "공기와 날벌레가 덜 닿아 냄새가 덜 퍼져요" },
      { title: "자주 비우기", detail: "여름엔 하루만 지나도 금방 상해요" },
    ],
    outro: "버리기 전에 물기부터 짜요",
    stockQueries: ["kitchen food waste", "kitchen trash bin", "cooking kitchen summer"],
  },
  {
    topic: "겨울 결로 덜 생기게 하는 습관",
    hook: "아침마다 창문에 물이 맺혀 있나요?",
    steps: [
      { title: "하루 두 번 환기", detail: "실내 습기가 빠져야 창에 물이 덜 맺혀요" },
      { title: "실내 빨래 줄이기", detail: "실내 건조는 습도를 높여 결로가 늘어요" },
      { title: "맺힌 물은 바로 닦기", detail: "창틀에 고인 물이 벽지 얼룩을 만들어요" },
    ],
    outro: "요리할 땐 주방 후드를 켜요",
    stockQueries: ["condensation window winter", "opening window ventilation", "wiping window glass"],
  },
  {
    topic: "겨울 난방비 아끼는 집안 습관",
    hook: "난방비, 새는 바람만 막아도 달라요",
    steps: [
      { title: "문풍지로 틈 막기", detail: "문과 창 틈으로 드는 찬바람을 막아요" },
      { title: "창에 뽁뽁이 붙이기", detail: "유리에 물을 뿌려 붙이면 창 냉기가 덜해요" },
      { title: "해 지면 커튼 치기", detail: "밤에 창으로 빠지는 온기를 줄여요" },
    ],
    outro: "낮엔 커튼을 열어 햇볕을 들여요",
    stockQueries: ["window insulation winter", "closing curtains evening", "cozy home winter"],
  },
  {
    topic: "환절기 이불 바꾸는 순서",
    hook: "환절기 이불, 꺼내서 바로 덮으면 꿉꿉해요",
    steps: [
      { title: "꺼낸 이불 털기", detail: "보관 중에 붙은 먼지를 밖에서 털어요" },
      { title: "햇볕에 말리기", detail: "보관하며 밴 눅눅함이 날아가요" },
      { title: "넣을 이불은 빨아서", detail: "땀이 남은 채 넣으면 얼룩과 냄새가 생겨요" },
    ],
    outro: "넣는 이불은 다 마른 뒤에 넣어요",
    stockQueries: ["hanging bedding sunlight", "folding blanket", "making bed bedroom"],
  },
  {
    topic: "봄맞이 대청소 순서",
    hook: "봄맞이 대청소, 어디서부터 할지 막막하죠?",
    steps: [
      { title: "버릴 것부터 정리", detail: "물건이 줄어야 청소할 곳이 보여요" },
      { title: "위에서 아래로", detail: "높은 곳 먼지가 떨어지니 바닥은 마지막이에요" },
      { title: "창문과 방충망 닦기", detail: "겨우내 쌓인 먼지를 닦고 찢어진 곳을 봐요" },
    ],
    outro: "하루에 한 공간씩 나눠서 해요",
    stockQueries: ["spring cleaning home", "cleaning window", "decluttering room"],
  },
  // ── 2026-10-24 추가 (근사장 상품용 - 같은 상품이 다시 나올 때 꿀팁을 돌려쓴다) ──
  {
    topic: "해먹 편하게 치는 요령",
    hook: "해먹, 누우면 몸이 접혀서 불편하죠?",
    steps: [
      { title: "나무 간격 먼저 보기", detail: "해먹 길이보다 조금 넓은 두 나무를 골라요" },
      { title: "줄은 처지게 걸기", detail: "팽팽하게 당기면 몸이 더 접혀서 불편해요" },
      { title: "대각선으로 눕기", detail: "비스듬히 누우면 몸이 펴지고 평평해져요" },
    ],
    outro: "나무엔 넓은 끈을 써서 껍질을 지켜요",
    stockQueries: ["hammock camping forest", "hammock between trees", "relaxing in hammock"],
  },
  {
    topic: "타프 치기 좋은 자리 고르는 법",
    hook: "타프 칠 자리, 아무 데나 고르면 고생해요",
    steps: [
      { title: "움푹한 곳 피하기", detail: "비가 오면 물이 고여 바닥이 젖어요" },
      { title: "머리 위 나뭇가지 보기", detail: "마른 가지는 바람에 떨어질 수 있어요" },
      { title: "바람 방향 확인하기", detail: "바람 오는 쪽을 낮게 쳐야 덜 흔들려요" },
    ],
    outro: "도착하면 먼저 한 바퀴 둘러봐요",
    stockQueries: ["camping site forest", "setting up tarp camping", "camping tarp shade"],
  },
  {
    topic: "비 올 때 타프 치는 요령",
    hook: "캠핑 중 비 소식, 타프 치는 법이 달라요",
    steps: [
      { title: "한쪽을 낮게 기울이기", detail: "물이 한쪽으로 흘러 지붕에 고이지 않아요" },
      { title: "줄에 짧은 끈 매기", detail: "줄 타고 흐르는 물이 끈에서 떨어져요" },
      { title: "젖으면 줄 다시 조이기", detail: "젖은 천과 줄은 늘어나 처지기 쉬워요" },
    ],
    outro: "바람까지 세면 무리하지 말고 걷어요",
    stockQueries: ["camping in rain", "rain tarp camping", "tent rain drops"],
  },
  {
    topic: "캠핑장 벌레 덜 꼬이게 하는 법",
    hook: "캠핑장 벌레, 자리부터 다르게 잡아요",
    steps: [
      { title: "고인 물에서 떨어지기", detail: "고인 물 근처는 모기가 많이 모여요" },
      { title: "음식은 바로 닫기", detail: "음식 냄새가 벌레를 불러 모아요" },
      { title: "조명은 자리와 멀리", detail: "불빛에 벌레가 모이니 앉는 곳과 떨어뜨려요" },
    ],
    outro: "해 질 녘엔 긴 옷이 편해요",
    stockQueries: ["camping evening lantern", "camping site lake", "camping food table"],
  },
  {
    topic: "텐트 안 습기 덜 차게 하는 법",
    hook: "아침에 텐트 안이 축축했던 적 있죠?",
    steps: [
      { title: "환기구는 열어 두기", detail: "숨에서 나온 습기가 빠져나갈 길이 생겨요" },
      { title: "젖은 옷은 밖에 두기", detail: "텐트 안에서 말리면 습기가 더 차요" },
      { title: "바닥에 방수포 깔기", detail: "땅에서 올라오는 물기와 냉기를 막아요" },
    ],
    outro: "방수포는 텐트보다 작게 깔아요",
    stockQueries: ["camping tent morning", "inside camping tent", "tent camping forest"],
  },
  {
    topic: "백패킹 배낭 가볍게 싸는 요령",
    hook: "백패킹 배낭, 메자마자 어깨가 아프죠?",
    steps: [
      { title: "무거운 짐은 등 쪽에", detail: "무게가 몸에 붙어야 덜 흔들리고 덜 힘들어요" },
      { title: "두 가지로 쓰는 물건", detail: "트레킹폴로 세우는 텐트면 폴대를 안 챙겨요" },
      { title: "자주 쓰는 건 바깥에", detail: "물과 간식은 배낭을 안 열고 꺼내요" },
    ],
    outro: "다 싸고 한 번 메고 걸어 봐요",
    stockQueries: ["backpacking hiking trail", "hiking backpack mountain", "packing backpack camping"],
  },
  {
    topic: "캠핑 담요 오래 쓰는 보관법",
    hook: "캠핑 담요, 보관하다 보면 냄새가 배죠?",
    steps: [
      { title: "다 말린 뒤 넣기", detail: "이슬 맞은 담요는 펼쳐 말려야 냄새가 안 배요" },
      { title: "세탁은 라벨대로", detail: "충전재가 뭉치지 않게 라벨 방법을 따라요" },
      { title: "오래 눌러 두지 않기", detail: "계속 압축해 두면 덜 부풀어 덜 따뜻해요" },
    ],
    outro: "집에선 수납가방 밖에 느슨하게 둬요",
    stockQueries: ["camping blanket", "folding blanket", "campfire blanket night"],
  },
  {
    topic: "차박 트렁크 공간 넓게 쓰는 법",
    hook: "차박할 때 트렁크가 금방 꽉 차죠?",
    steps: [
      { title: "잘 자리부터 정하기", detail: "누울 곳을 먼저 비우고 짐은 둘레에 둬요" },
      { title: "짐은 상자에 나눠 담기", detail: "종류별로 담으면 꺼낼 때 다 안 뒤져요" },
      { title: "젖은 건 차 밖에", detail: "차 안에 두면 습기가 차서 창이 흐려져요" },
    ],
    outro: "자주 꺼낼 짐은 문 쪽에 둬요",
    stockQueries: ["car camping trunk", "suv camping", "car camping night"],
  },
  {
    topic: "가죽 가방 오래 쓰는 관리법",
    hook: "가죽 가방, 비 맞고 나서 얼룩졌나요?",
    steps: [
      { title: "젖으면 그늘에서 말리기", detail: "드라이기나 햇볕에 말리면 가죽이 뻣뻣해져요" },
      { title: "속을 채워 보관하기", detail: "종이를 넣어 두면 모양이 안 무너져요" },
      { title: "비닐 대신 천 주머니", detail: "비닐에 넣으면 습기가 차서 얼룩이 생겨요" },
    ],
    outro: "손질 방법은 라벨 안내부터 봐요",
    stockQueries: ["leather bag", "vintage leather bag", "leather messenger bag"],
  },
  {
    topic: "새 가죽 노트 커버 길들이는 법",
    hook: "새 가죽 커버, 처음엔 뻣뻣하죠?",
    steps: [
      { title: "자주 손으로 쓰기", detail: "손의 온기와 유분으로 가죽이 부드러워져요" },
      { title: "물기는 바로 닦기", detail: "물방울이 마르면 얼룩으로 남아요" },
      { title: "창가 햇볕 피하기", detail: "오래 빛을 받으면 색이 바래요" },
    ],
    outro: "쓸수록 생기는 주름이 가죽의 멋이에요",
    stockQueries: ["leather notebook", "writing in journal", "leather journal desk"],
  },
  {
    topic: "오토바이 가방 달기 전 확인할 것",
    hook: "오토바이 가방, 달리다 흔들려 불안했죠?",
    steps: [
      { title: "좌우 무게 맞추기", detail: "한쪽만 무거우면 차체가 기울어 위험해요" },
      { title: "고정끈 다시 조이기", detail: "출발 전과 쉴 때 느슨해졌는지 봐요" },
      { title: "머플러와 거리 두기", detail: "배기관 열에 가방이 닿으면 상해요" },
    ],
    outro: "무거운 짐은 낮고 몸 가까이 실어요",
    stockQueries: ["motorcycle travel", "motorcycle saddlebags", "motorcycle road trip"],
  },
  {
    topic: "승마 안장 패드 관리하는 법",
    hook: "안장 패드, 땀에 젖은 채 두고 있나요?",
    steps: [
      { title: "타고 나면 바로 펼치기", detail: "땀에 젖은 채 접어 두면 냄새가 배요" },
      { title: "털은 솔로 먼저 털기", detail: "말털을 털고 빨아야 세탁기에 덜 남아요" },
      { title: "그늘에서 말리기", detail: "햇볕에 오래 두면 색이 바래고 천이 상해요" },
    ],
    outro: "패드가 여러 장이면 번갈아 써요",
    stockQueries: ["horse riding", "horse saddle", "equestrian stable"],
  },
];

/** 주제 → 검수본 (없으면 null - 그 주제는 영상을 만들지 않는다) */
export function reviewedTip(topic: string): ReviewedTip | null {
  return TIP_SCRIPTS.find((t) => t.topic === topic) ?? null;
}
