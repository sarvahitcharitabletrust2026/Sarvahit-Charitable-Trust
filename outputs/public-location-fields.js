(() => {
  const cache = new Map();

  async function fetchLocations(path, selection) {
    const key = JSON.stringify([path, selection]);
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const response = await fetch("https://countriesnow.space/api/v0.1/countries/" + path, {
          signal: AbortSignal.timeout(10000),
          ...(selection ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection) } : {})
        });
        if (!response.ok) throw new Error("Location lookup failed.");
        const result = await response.json();
        if (result.error) throw new Error("Location lookup failed.");
        return result.data;
      })().catch((error) => {
        cache.delete(key);
        throw error;
      }));
    }
    return cache.get(key);
  }

  function setOptions(field, placeholder, options = [], selected = "") {
    const values = [...new Set(options.filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
    field.replaceChildren(new Option(placeholder, ""), ...values.map((value) =>
      new Option(value, value, field.name === "country" && value === "India")));
    field.value = selected;
  }

  document.querySelectorAll("[data-location-status]").forEach((status) => {
    const form = status.closest("form");
    const { country, state, city } = form.elements;
    let request = 0;

    async function loadCities(selectedCountry, selectedState, current) {
      const cities = selectedState
        ? await fetchLocations("state/cities", { country: selectedCountry, state: selectedState })
        : await fetchLocations("cities", { country: selectedCountry });
      if (current === request) setOptions(city, "Select city", cities);
    }

    async function refresh(level) {
      const current = ++request;
      const selectedCountry = country.value;
      const selectedState = state.value === "Not applicable" ? "" : state.value;
      if (level !== "city") setOptions(state, "Select state");
      setOptions(city, "Select city");
      status.hidden = !selectedCountry;
      status.textContent = selectedCountry ? "Loading location options…" : "";
      try {
        if (level === "country") {
          const countries = await fetchLocations("iso");
          if (current !== request) return;
          setOptions(country, "Select country", [...countries.map((item) => item.name), "India"], selectedCountry || "India");
        }
        if (selectedCountry && level !== "city") {
          const result = await fetchLocations("states", { country: selectedCountry });
          if (current !== request) return;
          const states = result.states.map((item) => item.name);
          setOptions(state, "Select state", states.length ? states : ["Not applicable"], states.length ? "" : "Not applicable");
          if (!states.length) await loadCities(selectedCountry, "", current);
        } else if (selectedCountry && state.value) {
          await loadCities(selectedCountry, selectedState, current);
        }
        if (current === request) { status.textContent = ""; status.hidden = true; }
      } catch {
        if (current !== request) return;
        status.textContent = "Location options could not be loaded. Reopen or reload the page to try again.";
        status.hidden = false;
      }
    }

    country.addEventListener("change", () => refresh("state"));
    state.addEventListener("change", () => refresh("city"));
    form.addEventListener("reset", () => queueMicrotask(() => refresh("country")));
    refresh("country");
  });
})();
