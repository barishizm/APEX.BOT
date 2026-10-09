// Static markup; the reveal is CSS-only so the demo renders without JS.
export function HeroDemo() {
  return (
    <figure className="demo">
      <div className="demo__head">
        <span className="demo__dot" aria-hidden="true" />
        <span>JJ · kahvedukkani.com</span>
      </div>

      <div className="demo__body">
        <p className="msg msg--visitor">Kahveyi beğenmezsem iade edebilir miyim?</p>
        <div className="msg msg--bot">
          <p>
            Evet. Paket açılmamışsa teslimattan sonraki 14 gün içinde ücretsiz iade edebilirsiniz. Öğütülmüş kahvelerde
            iade yapılmıyor.
          </p>
          <span className="msg__source">kahvedukkani.com/iade</span>
        </div>
      </div>

      <figcaption className="sr-only">
        Örnek konuşma: JJ, ziyaretçinin iade sorusunu sitedeki iade sayfasına dayanarak yanıtlıyor ve kaynağı
        gösteriyor.
      </figcaption>
    </figure>
  );
}
