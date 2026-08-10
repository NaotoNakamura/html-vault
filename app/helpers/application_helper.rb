module ApplicationHelper
  VITE_DEV_SERVER_URL = "http://localhost:5173".freeze

  def vite_dev_server?
    Rails.env.development?
  end

  def vite_client_tag
    return unless vite_dev_server?
    safe_join([vite_client_script_tag, vite_react_refresh_tag])
  end

  def vite_entry_tag(entry)
    if vite_dev_server?
      tag.script type: "module", src: "#{VITE_DEV_SERVER_URL}/#{entry}"
    else
      vite_manifest_entry_tag(entry)
    end
  end

  private

  def vite_client_script_tag
    tag.script type: "module", src: "#{VITE_DEV_SERVER_URL}/@vite/client"
  end

  # @vitejs/plugin-react normally injects this preamble itself via Vite's own
  # index.html transform. We bypass that (Rails serves the HTML, the browser
  # requests /src/main.tsx directly), so without this React Fast Refresh
  # throws on load ("can't detect preamble") and the whole module aborts.
  def vite_react_refresh_tag
    content_tag :script, type: "module" do
      <<~JS.html_safe
        import RefreshRuntime from "#{VITE_DEV_SERVER_URL}/@react-refresh"
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
      JS
    end
  end

  # Reads the manifest written by `vite build` (manifest: true in vite.config.ts)
  # and links the hashed, fingerprinted files it produced. Not exercised yet since
  # production is on hold, but kept correct so it's ready when that comes back up.
  def vite_manifest_entry_tag(entry)
    manifest = JSON.parse(Rails.root.join("public/.vite/manifest.json").read)
    chunk = manifest.fetch(entry)

    css_tags = Array(chunk["css"]).map { |href| tag.link rel: "stylesheet", href: "/#{href}" }
    js_tag = tag.script src: "/#{chunk['file']}", type: "module"

    safe_join(css_tags + [js_tag])
  end
end
