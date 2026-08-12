class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  IAP_EMAIL_HEADER = "X-Goog-Authenticated-User-Email"
  DEV_DUMMY_EMAIL = "dev@example.com"

  private

  # Cloud IAP forwards the verified identity as "accounts.google.com:user@example.com".
  # In development there is no IAP in front of the app, so a dummy email is used instead
  # (override via the same header, e.g. `-H "X-Goog-Authenticated-User-Email: accounts.google.com:me@example.com"`).
  def current_user_email
    raw_header = request.headers[IAP_EMAIL_HEADER]

    if raw_header.present?
      raw_header.split(":").last
    elsif Rails.env.development? || Rails.env.test?
      DEV_DUMMY_EMAIL
    end
  end
end
