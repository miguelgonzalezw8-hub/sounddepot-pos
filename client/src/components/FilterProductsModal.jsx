import "./FilterProductsModal.css";

export default function FilterProductsModal({
  open,
  onClose,

  // category bucket
  bucket,
  setBucket,
  bucketCounts,

  // brand
  brand,
  setBrand,
  brandOptions,

  // speaker-only
  location,
  setLocation,
  locationOptions,

  // radio-only
  din,
  setDin,
}) {
  if (!open) return null;

  const buckets = [
    "All",
    "Speakers",
    "Dash Kits",
    "Harnesses",
    "Antennas",
    "Radios",
    "Interfaces",
    "Accessories",
  ];

  const showBrand = bucket !== "All"; // you can keep it on All too; this keeps it cleaner
  const showSpeakerFilters = bucket === "Speakers";
  const showRadioFilters = bucket === "Radios";

  return (
    <div className="fp-backdrop" onMouseDown={onClose}>
      <div className="fp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="fp-header">
          <div className="fp-title">Filter Products</div>
          <button className="fp-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* CATEGORY BUCKETS */}
        <div className="fp-section">
          <div className="fp-label">Category</div>
          <div className="fp-chips">
            {buckets.map((b) => {
              const count = bucketCounts?.[b] ?? 0;
              const disabled = b !== "All" && count === 0;

              return (
                <button
                  key={b}
                  disabled={disabled}
                  className={`fp-chip ${bucket === b ? "active" : ""} ${
                    disabled ? "disabled" : ""
                  }`}
                  onClick={() => setBucket(b)}
                  title={
                    disabled ? `No products in ${b} (based on inventory)` : b
                  }
                >
                  {b}
                  {b !== "All" ? (
                    <span className="fp-chip-count">{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* BRAND (conditional) */}
        {showBrand && (
          <div className="fp-section">
            <div className="fp-label">Brand</div>
            <select
              className="fp-select"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              {brandOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SPEAKER LOCATION (speakers only) */}
        {showSpeakerFilters && (
          <div className="fp-section">
            <div className="fp-label">Speaker Location</div>
            <select
              className="fp-select"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {locationOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* RADIO DIN (radios only) */}
        {showRadioFilters && (
          <div className="fp-section">
            <div className="fp-label">Radio Size</div>
            <div className="fp-row">
              <label className="fp-check">
                <input
                  type="radio"
                  name="din"
                  checked={din === "All"}
                  onChange={() => setDin("All")}
                />
                <span>All</span>
              </label>
              <label className="fp-check">
                <input
                  type="radio"
                  name="din"
                  checked={din === "Single"}
                  onChange={() => setDin("Single")}
                />
                <span>Single DIN</span>
              </label>
              <label className="fp-check">
                <input
                  type="radio"
                  name="din"
                  checked={din === "Double"}
                  onChange={() => setDin("Double")}
                />
                <span>Double DIN</span>
              </label>
            </div>
          </div>
        )}

        {/* ACTIONS */}
        <div className="fp-actions">
          <button
            className="fp-btn"
            onClick={() => {
              setBucket("All");
              setBrand("All");
              setLocation("All");
              setDin("All");
            }}
          >
            Clear
          </button>
          <button className="fp-btn primary" onClick={onClose}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
