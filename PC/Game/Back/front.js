// front.js
const uiOverlay = document.getElementById('ui-overlay');

// Back에서 호출할 렌더링 함수
function updateRender(target_id, status, sword_transform) {
    uiOverlay.innerHTML = `
        <h3>플레이어: ${target_id}</h3>
        <p>상태: <strong>${status}</strong></p>
        <p>검 궤적(x): ${sword_transform.position.x.toFixed(2)}</p>
    `;
    console.log(`Front 렌더링 업데이트 - 대상: ${target_id}, 상태: ${status}`);
}