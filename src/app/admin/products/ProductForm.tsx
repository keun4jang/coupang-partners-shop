import type { Product } from "@/types/db";

const CATEGORIES = [
  "생활템",
  "청소템",
  "수납템",
  "주방템",
  "차량용품",
  "육아생활템",
  "자취템",
  "반려동물",
  "뷰티",
  "캠핑",
];

const inputCls =
  "w-full rounded-xl border border-accent px-4 py-2.5 bg-cream focus:outline-none focus:ring-2 focus:ring-primary text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** 상품 등록/수정 공용 폼 (서버 컴포넌트, HTML form POST) */
export default function ProductForm({
  action,
  product,
}: {
  action: string;
  product?: Product;
}) {
  return (
    <form method="POST" action={action} className="flex flex-col gap-4 mt-5">
      {product && <input type="hidden" name="_action" value="update" />}

      <Field label="상품명 *">
        <input
          name="product_name"
          required
          defaultValue={product?.product_name ?? ""}
          placeholder="예: 차량용 미니 청소기"
          className={inputCls}
        />
      </Field>

      <Field label="카테고리">
        <select
          name="category"
          defaultValue={product?.category ?? "생활템"}
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="쿠팡파트너스 링크 *">
        <input
          name="coupang_partner_url"
          required
          type="url"
          defaultValue={product?.coupang_partner_url ?? ""}
          placeholder="https://link.coupang.com/..."
          className={inputCls}
        />
      </Field>

      <Field label="타겟 (targetUser)">
        <input
          name="target_user"
          defaultValue={product?.target_user ?? ""}
          placeholder="예: 아이 키우는 차주"
          className={inputCls}
        />
      </Field>

      <Field label="불편한 점 (painPoint)">
        <input
          name="pain_point"
          defaultValue={product?.pain_point ?? ""}
          placeholder="예: 차 안에 과자 부스러기가 자주 떨어진다"
          className={inputCls}
        />
      </Field>

      <Field label="핵심 장점 (mainBenefit)">
        <input
          name="main_benefit"
          defaultValue={product?.main_benefit ?? ""}
          placeholder="예: 작아서 차에 두고 쓰기 편하다"
          className={inputCls}
        />
      </Field>

      <Field label="가격대 (priceText)">
        <input
          name="price_text"
          defaultValue={product?.price_text ?? ""}
          placeholder="예: 1만원대"
          className={inputCls}
        />
      </Field>

      <Field label="상품 이미지 URL">
        <input
          name="image_url"
          type="url"
          defaultValue={product?.image_url ?? ""}
          placeholder="https://..."
          className={inputCls}
        />
      </Field>

      <Field label="메모 (sourceMemo)">
        <textarea
          name="source_memo"
          defaultValue={product?.source_memo ?? ""}
          rows={2}
          placeholder="어디서 발견했는지, 참고 사항 등"
          className={inputCls}
        />
      </Field>

      <button
        type="submit"
        className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl py-3 mt-2"
      >
        {product ? "수정 저장" : "상품 등록"}
      </button>
    </form>
  );
}
