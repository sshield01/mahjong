import Back from "../tiles/Regular/Back.svg";
import Blank from "../tiles/Regular/Blank.svg";
import Chun from "../tiles/Regular/Chun.svg";
import Front from "../tiles/Regular/Front.svg";
import Haku from "../tiles/Regular/Haku.svg";
import Hatsu from "../tiles/Regular/Hatsu.svg";
import Man1 from "../tiles/Regular/Man1.svg";
import Man2 from "../tiles/Regular/Man2.svg";
import Man3 from "../tiles/Regular/Man3.svg";
import Man4 from "../tiles/Regular/Man4.svg";
import Man5 from "../tiles/Regular/Man5.svg";
import Man6 from "../tiles/Regular/Man6.svg";
import Man7 from "../tiles/Regular/Man7.svg";
import Man8 from "../tiles/Regular/Man8.svg";
import Man9 from "../tiles/Regular/Man9.svg";
import Nan from "../tiles/Regular/Nan.svg";
import Pei from "../tiles/Regular/Pei.svg";
import Pin1 from "../tiles/Regular/Pin1.svg";
import Pin2 from "../tiles/Regular/Pin2.svg";
import Pin3 from "../tiles/Regular/Pin3.svg";
import Pin4 from "../tiles/Regular/Pin4.svg";
import Pin5 from "../tiles/Regular/Pin5.svg";
import Pin6 from "../tiles/Regular/Pin6.svg";
import Pin7 from "../tiles/Regular/Pin7.svg";
import Pin8 from "../tiles/Regular/Pin8.svg";
import Pin9 from "../tiles/Regular/Pin9.svg";
import Shaa from "../tiles/Regular/Shaa.svg";
import Sou1 from "../tiles/Regular/Sou1.svg";
import Sou2 from "../tiles/Regular/Sou2.svg";
import Sou3 from "../tiles/Regular/Sou3.svg";
import Sou4 from "../tiles/Regular/Sou4.svg";
import Sou5 from "../tiles/Regular/Sou5.svg";
import Sou6 from "../tiles/Regular/Sou6.svg";
import Sou7 from "../tiles/Regular/Sou7.svg";
import Sou8 from "../tiles/Regular/Sou8.svg";
import Sou9 from "../tiles/Regular/Sou9.svg";
import Ton from "../tiles/Regular/Ton.svg";

const images = {
  Back,
  Blank,
  Chun,
  Front,
  Haku,
  Hatsu,
  Man1,
  Man2,
  Man3,
  Man4,
  Man5,
  Man6,
  Man7,
  Man8,
  Man9,
  Nan,
  Pei,
  Pin1,
  Pin2,
  Pin3,
  Pin4,
  Pin5,
  Pin6,
  Pin7,
  Pin8,
  Pin9,
  Shaa,
  Sou1,
  Sou2,
  Sou3,
  Sou4,
  Sou5,
  Sou6,
  Sou7,
  Sou8,
  Sou9,
  Ton,
};

// Every face is its own file -- thirty-odd of them, the largest around 60 kB --
// and a tile only asks for one when it is already on screen needing it. So the
// deal fires a dozen requests at once against a cold cache, and a hand comes up
// with blank faces that fill in one by one as the files land. It reads as tiles
// arriving broken and then repairing themselves.
//
// Ask for them all as soon as the app loads. That is the lobby, where there is
// nothing else competing and time to spare before anybody is dealt anything. The
// requests go through the browser's ordinary cache, so this only ever costs the
// first load; the `Image` objects are dropped immediately and only the cache
// entries matter.
if (typeof Image !== "undefined") {
  for (const url of Object.values(images)) {
    new Image().src = url;
  }
}

export default images;
