module Api
  module V1
    class BundlesController < BaseController
      before_action :set_bundle, only: :destroy

      def index
        bundles = Bundle.includes(:user_files).order(created_at: :desc)
        render json: bundles.map { |bundle| serialize(bundle) }
      end

      def create
        uploads = Array(params[:files]).select { |f| f.respond_to?(:original_filename) }

        if uploads.empty?
          return render json: { errors: [ "files are required" ] }, status: :unprocessable_entity
        end

        if uploads.size > Bundle::MAX_FILES
          return render json: { errors: [ "at most #{Bundle::MAX_FILES} files are allowed per bundle" ] }, status: :unprocessable_entity
        end

        bundle = nil
        errors = nil

        ActiveRecord::Base.transaction do
          default_title = File.basename(uploads.first.original_filename, ".*")
          bundle = Bundle.new(title: params[:title].presence || default_title)

          unless bundle.save
            errors = bundle.errors.full_messages
            raise ActiveRecord::Rollback
          end

          uploads.each do |uploaded|
            extension = File.extname(uploaded.original_filename).delete_prefix(".").downcase
            user_file = bundle.user_files.new(
              filename: uploaded.original_filename,
              title: File.basename(uploaded.original_filename, ".*"),
              file_type: extension
            )
            user_file.file.attach(uploaded)

            unless user_file.save
              errors = user_file.errors.full_messages.map { |message| "#{uploaded.original_filename}: #{message}" }
              raise ActiveRecord::Rollback
            end
          end
        end

        if errors
          render json: { errors: errors }, status: :unprocessable_entity
        else
          render json: serialize(bundle.reload), status: :created
        end
      end

      def destroy
        @bundle.destroy
        head :no_content
      end

      private

      def set_bundle
        @bundle = Bundle.find(params[:id])
      end

      def serialize(bundle)
        files = bundle.user_files.order(:created_at).map { |user_file| serialize_file(bundle, user_file) }
        entry = files.find { |file| file[:file_type] == "html" } || files.first

        {
          id: bundle.id,
          public_id: bundle.public_id,
          title: bundle.title,
          created_at: bundle.created_at.iso8601,
          preview_url: entry&.fetch(:preview_url),
          files: files
        }
      end

      def serialize_file(bundle, user_file)
        {
          id: user_file.id,
          filename: user_file.filename,
          title: user_file.title,
          file_type: user_file.file_type,
          created_at: user_file.created_at.iso8601,
          preview_url: bundle_preview_path(bundle_public_id: bundle.public_id, filename: user_file.filename)
        }
      end
    end
  end
end
