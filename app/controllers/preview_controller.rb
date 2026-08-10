class PreviewController < ApplicationController
  def show
    user_file = UserFile.find_by!(public_id: params[:public_id])

    # Isolate untrusted user-uploaded content from the parent app: no allow-same-origin,
    # so the sandboxed document can never read this app's cookies/session/localStorage.
    response.set_header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-modals;")
    response.set_header("X-Content-Type-Options", "nosniff")

    send_data user_file.file.download,
      type: user_file.content_type,
      filename: user_file.filename,
      disposition: "inline"
  rescue ActiveRecord::RecordNotFound
    head :not_found
  end
end
