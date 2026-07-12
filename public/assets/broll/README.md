# B-roll 영상 폴더

카테고리별 상황 배경 영상(mp4)을 이 폴더에 넣으면 숏폼 배경으로 사용됩니다.
파일이 없으면 자동으로 그라디언트 모션 배경이 사용됩니다.

## 파일명 규칙 (remotion/config/videoConfig.ts 의 BROLL_BY_CATEGORY 참고)

| 카테고리 | 파일명 후보 |
|---|---|
| 차량용품 | car.mp4, driving.mp4, car-interior.mp4 |
| 청소템 | cleaning.mp4, bathroom.mp4, sink.mp4, tiles.mp4 |
| 수납템 | storage.mp4, room.mp4, organizing.mp4 |
| 주방템 | kitchen.mp4, cooking.mp4, sink.mp4 |
| 자취템 | small-room.mp4, desk.mp4, daily-life.mp4 |
| 육아생활템 | kids-room.mp4, family-home.mp4, organizing.mp4 |
| 생활템 | daily-life.mp4, room.mp4, organizing.mp4 |
| 반려동물 | pet.mp4, home.mp4, cleaning.mp4 |
| 뷰티 | bathroom.mp4, mirror.mp4, skincare.mp4 |
| 캠핑 | outdoor.mp4, camping.mp4 |

## 권장 사양

- 세로형(9:16) 또는 확대해도 어색하지 않은 영상
- 10초 이상 길이
- 저작권 무료 소스 (Pexels, Pixabay 등) 사용

## 주의

- 실제 mp4 파일은 용량이 크므로 git 에 커밋할지 여부는 선택입니다.
  (용량이 크면 .gitignore 에 `public/assets/broll/*.mp4` 추가 권장)
