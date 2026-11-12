/*
 * 관심 하나가 보는 평형들. 보통은 하나지만, 등록할 때 '같은 평형 묶기'를 켜면 전용 면적이
 * 같은 평형 여럿(59A · 59B …)이 한 관심에 담긴다 (room_types).
 * → [{ id, supply, exclusive }]
 */
function members(w) {
  const many = Array.isArray(w.room_types) ? w.room_types.filter((t) => t && t.id) : [];
  /* 직방은 매물이 없는 평형의 면적을 주지 않는다. 그런 평형은 묶음의 면적(같은 평형이라 묶인
     것이다)을 따른다. */
  if (many.length) {
    return many.map((t) => ({
      id: String(t.id), supply: Number(t.supply) || Number(w.supply_m2) || 0,
      exclusive: Number(t.exclusive) || Number(w.exclusive_m2) || 0
    }));
  }
  return [{ id: String(w.room_type_id), supply: Number(w.supply_m2) || 0, exclusive: Number(w.exclusive_m2) || 0 }];
}

module.exports = { members };
