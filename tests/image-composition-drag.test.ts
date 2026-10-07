import assert from "node:assert/strict";
import test from "node:test";
import { getDraggedImagePosition, getImagePositionTravel } from "@/lib/utils/menu-image-display";

test("drag follows the pointer with whitespace, cropping and zoom on both axes", () => {
    for (const fit of ["cover", "contain"] as const) {
        for (const zoom of [50, 100, 150, 250]) {
            for (const [imageWidth, imageHeight] of [[800, 400], [400, 800], [400, 400]]) {
                const travel = getImagePositionTravel({ frameWidth: 400, frameHeight: 250, imageWidth, imageHeight, fit, zoom });
                for (const axisTravel of [travel.x, travel.y]) {
                    if (Math.abs(axisTravel) < 0.01) {
                        assert.equal(getDraggedImagePosition(50, 20, axisTravel), 50);
                    } else {
                        const delta = Math.min(20, Math.abs(axisTravel) / 4);
                        for (const direction of [-1, 1]) {
                            const next = getDraggedImagePosition(50, direction * delta, axisTravel);
                            const renderedMovement = axisTravel * (next - 50) / 100;
                            assert.ok(renderedMovement * direction > 0, `${fit} ${zoom}% follows pointer`);
                            assert.ok(Math.abs(renderedMovement - direction * delta) <= Math.abs(axisTravel) / 200 + 0.001);
                        }
                    }
                }
            }
        }
    }
});

test("movement is bounded and invalid/loading geometry cannot move the image", () => {
    assert.equal(getDraggedImagePosition(50, 1000, 200), 100);
    assert.equal(getDraggedImagePosition(50, 1000, -200), 0);
    assert.equal(getDraggedImagePosition(50, -1000, 200), 0);
    assert.equal(getDraggedImagePosition(50, -1000, -200), 100);
    for (const travel of [0, 0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(getDraggedImagePosition(37, 10, travel), 37);
    }
    assert.deepEqual(getImagePositionTravel({ frameWidth: 400, frameHeight: 250, imageWidth: 0, imageHeight: 0, fit: "cover", zoom: 100 }), {x: 0, y: 0});
});
