class PreviewController < ApplicationController
  # This action serves public, unauthenticated content (including .js files) that is
  # meant to be embedded cross-origin, e.g. a bundle's <script src="app.js"> loaded
  # from inside the sandboxed preview iframe. Without this, Rails' CSRF layer treats
  # any cross-origin GET of a JavaScript response as a suspected credential leak
  # (the same protection that blocks legacy JSONP-style attacks) and rejects it.
  skip_forgery_protection

  rescue_from ActiveRecord::RecordNotFound do
    head :not_found
  end

  def show
    deliver(UserFile.find_by!(public_id: params[:public_id]))
  end

  def bundle_show
    bundle = Bundle.find_by!(public_id: params[:bundle_public_id])
    deliver(bundle.user_files.find_by!(filename: params[:filename]))
  end

  private

  def deliver(user_file)
    # Isolate untrusted user-uploaded content from the parent app: no allow-same-origin,
    # so the sandboxed document can never read this app's cookies/session/localStorage.
    response.set_header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-modals;")
    response.set_header("X-Content-Type-Options", "nosniff")

    send_data user_file.file.download,
      type: user_file.content_type,
      filename: user_file.filename,
      disposition: "inline"
  end
end
