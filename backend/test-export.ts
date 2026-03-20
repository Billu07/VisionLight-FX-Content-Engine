import { renderVideoSequence } from "./src/services/videoEditor";

async function test() {
    try {
        const url = await renderVideoSequence({
            sequence: [
                {
                    id: "1",
                    url: "https://www.w3schools.com/html/mov_bbb.mp4",
                    type: "VIDEO",
                    duration: 3000,
                    trimStart: 0,
                    speed: 1
                }
            ],
            audioTracks: []
        }, "test-user");
        console.log("Success:", url);
    } catch (e) {
        console.error("Test failed:", e);
    }
}
test();