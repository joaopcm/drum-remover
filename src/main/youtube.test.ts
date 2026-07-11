import { describe, expect, it } from "vitest";
import { parseVideoId, thumbnailUrl, watchUrl } from "./youtube";

describe("parseVideoId", () => {
  it("parses a standard watch URL", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("parses a watch URL with extra params", () => {
    expect(
      parseVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ&list=abc&t=42s")
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses a youtu.be short link", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?si=xyz")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("parses shorts, embed, and live URLs", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("parses music.youtube.com and a bare id", () => {
    expect(parseVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-YouTube and malformed input", () => {
    expect(parseVideoId("")).toBeNull();
    expect(parseVideoId("not a url")).toBeNull();
    expect(parseVideoId("https://vimeo.com/12345")).toBeNull();
    expect(parseVideoId("https://www.youtube.com/watch?v=tooShort")).toBeNull();
  });
});

describe("url helpers", () => {
  it("builds canonical watch and thumbnail URLs", () => {
    expect(watchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );
    expect(thumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );
  });
});
